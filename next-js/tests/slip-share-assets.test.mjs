import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { loadSlipShareAssets, requiredSlipShareAssets, SlipShareLogoError, slipShareBrandAsset } from '../src/components/slips/sharing/slip-share-assets.ts';

const page=(home='/flags/us.svg',away=home,league=home)=>({rows:[{homeLogo:home,awayLogo:away,competitionLogo:league}]});
function images(t,behavior=()=> 'load') {
  const original=globalThis.Image,instances=[],calls=new Map();
  globalThis.Image=class {
    naturalWidth=64;naturalHeight=48;onload=null;onerror=null;value='';
    constructor(){instances.push(this);}
    set src(value){
      this.value=value;if(!value)return;
      assert.equal(this.crossOrigin,'anonymous');assert.equal(this.referrerPolicy,'no-referrer');
      const count=(calls.get(value)??0)+1;calls.set(value,count);
      const action=behavior(value,count,this);
      if(action!=='hold')queueMicrotask(()=>action==='error'?this.onerror?.():this.onload?.());
    }
    get src(){return this.value;}
    decode(){return this.decoding??Promise.resolve();}
  };
  t.after(()=>{globalThis.Image=original;});
  return {instances,calls};
}

test('all supplied logos and branding are required; only catalog absence allows initials',()=>{
  const remote='https://static.match-card.test/crest.png';
  assert.deepEqual(requiredSlipShareAssets([page('https://media.api-sports.io/flags/us.svg','https://flagcdn.com/w80/us.png',remote),page()]),
    [slipShareBrandAsset,'/flags/us.svg',remote]);
  assert.deepEqual(requiredSlipShareAssets([page(null)]),[slipShareBrandAsset]);
  for(const source of ['','//untrusted.test/a.png','http://untrusted.test/a.png','data:image/png;base64,x','https://user:secret@untrusted.test/a.png'])
    assert.throws(()=>requiredSlipShareAssets([page(source)]),error=>error instanceof SlipShareLogoError&&error.reason==='invalid');
});

test('preparation waits for every decode, including approved remote images, rather than only load events',async t=>{
  let release;const decoding=new Promise(resolve=>{release=resolve;});
  const remote='https://static.match-card.test/crest.png';
  const f=images(t,(source,_attempt,image)=>{if(source===remote)image.decoding=decoding;return 'load';});
  const progress=[];let completed=false;
  const task=loadSlipShareAssets([page(remote)],undefined,(done,total)=>progress.push([done,total])).then(value=>{completed=true;return value;});
  await setImmediate();assert.equal(completed,false);assert.deepEqual(progress,[[0,2],[1,2]]);
  release();const result=await task;
  assert.equal(result.size,2);assert.equal(f.calls.get(remote),1);assert.deepEqual(progress.at(-1),[2,2]);
});

test('a transient load failure retries and every required asset is retained',async t=>{
  const f=images(t,(source,attempt)=>source==='/flags/us.svg'&&attempt===1?'error':'load');
  const result=await loadSlipShareAssets([page(),page()]);
  assert.equal(result.size,2);assert.equal(f.calls.get('/flags/us.svg'),2);
});

test('failed decoding exhausts bounded retries and rejects instead of returning partial logos',async t=>{
  const f=images(t,(source,_attempt,image)=>{
    if(source==='/flags/us.svg')image.decode=()=>Promise.reject(new Error('Decode failed'));
    return 'load';
  });
  await assert.rejects(loadSlipShareAssets([page()]),error=>error instanceof SlipShareLogoError&&error.reason==='unavailable');
  assert.equal(f.calls.get('/flags/us.svg'),2);
});

test('an asset timeout rejects after retries without producing a partial asset set',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=images(t,source=>source==='/flags/us.svg'?'hold':'load');
  const task=assert.rejects(loadSlipShareAssets([page()]),SlipShareLogoError);
  await setImmediate();t.mock.timers.tick(15_000);await setImmediate();
  assert.equal(f.calls.get('/flags/us.svg'),2);
  t.mock.timers.tick(15_000);await task;
});

test('cancellation clears active image requests and the six-worker queue never starts remaining logos',async t=>{
  const f=images(t,()=> 'hold'),controller=new AbortController();
  const pages=Array.from({length:12},(_,index)=>page(`/badges/teams/${index+1}/96.webp`));
  const task=assert.rejects(loadSlipShareAssets(pages,controller.signal),error=>error.name==='AbortError');
  assert.equal(f.instances.length,6);
  controller.abort();await task;
  assert.ok(f.instances.every(image=>image.src===''));assert.equal(f.instances.length,6);
});

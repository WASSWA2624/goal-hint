import { execFileSync } from "node:child_process";
import test from "node:test";

test("standalone and delayed styled shells receive a complete theme while existing themes remain intact", () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import {registerHooks,createRequire} from 'node:module';
    import {existsSync,readFileSync,statSync} from 'node:fs';
    import {pathToFileURL,fileURLToPath} from 'node:url';
    import {PassThrough} from 'node:stream';
    const root=pathToFileURL(process.cwd()+'/'),require=createRequire(root),ts=require('typescript');
    const styled=new URL('node_modules/styled-components/dist/styled-components.esm.js',root).href;
    const probe=base=>['','.ts','.tsx','/index.ts','/index.tsx'].map(suffix=>base+suffix).find(path=>existsSync(path)&&statSync(path).isFile());
    registerHooks({
      resolve(specifier,context,next){
        if(specifier==='styled-components') return {url:styled,format:'module',shortCircuit:true};
        const base=specifier.startsWith('@/')?fileURLToPath(new URL('src/'+specifier.slice(2),root))
          :specifier.startsWith('.')&&context.parentURL?.includes('/src/')?fileURLToPath(new URL(specifier,context.parentURL)):null;
        const found=base&&probe(base);
        if(found)return {url:pathToFileURL(found).href,shortCircuit:true};
        try{return next(specifier,context)}catch(error){if(base||error.code!=='ERR_MODULE_NOT_FOUND')throw error;
          return {url:pathToFileURL(require.resolve(specifier)).href,shortCircuit:true};}
      },
      load(url,context,next){
        const path=url.startsWith('file:')?fileURLToPath(url):null;
        if(url===styled)return {format:'module',source:readFileSync(path,'utf8'),shortCircuit:true};
        if(url.startsWith(root.href)&&url.endsWith('.json'))return {format:'module',source:'export default '+readFileSync(path,'utf8'),shortCircuit:true};
        if(!/\/src\/.*\.tsx?$/u.test(url))return next(url,context);
        return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(path,'utf8'),{fileName:path,
          compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
      }
    });
    const [{createElement:h,useContext,use,Suspense},{renderToStaticMarkup,renderToPipeableStream},
      {ThemeProvider,ThemeContext},{FallbackStyleProvider},{lightTheme,darkTheme,isGoalHintTheme},{SkipLink}]=await Promise.all([
      import('react'),import('react-dom/server'),import('styled-components'),import('./src/styles/provider.tsx'),
      import('./src/styles/theme.ts'),import('./src/components/navigation/shell-styles.tsx')]);
    function ThemeProbe(){const theme=useContext(ThemeContext);return h(SkipLink,{'href':'#main','data-mode':theme.mode,
      'data-height':theme.control.minHeight,'data-color':theme.color.text},'Skip');}
    const fallback=()=>h(FallbackStyleProvider,null,h(ThemeProbe));
    for(const value of [undefined,null,{}, {mode:'dark'},{...lightTheme,control:undefined}]){
      assert.equal(isGoalHintTheme(value),false);
      const html=renderToStaticMarkup(h(ThemeContext.Provider,{value},fallback()));
      assert.match(html,/data-mode="light"/);
      assert.match(html,/data-height="2.75rem"/);
    }
    for(const theme of [lightTheme,darkTheme,{...darkTheme,control:{...darkTheme.control,minHeight:'3rem'}}]){
      assert.equal(isGoalHintTheme(theme),true);
      const html=renderToStaticMarkup(h(ThemeProvider,{theme},fallback()));
      assert.ok(html.includes('data-mode="'+theme.mode+'"'));
      assert.ok(html.includes('data-height="'+theme.control.minHeight+'"'));
      assert.ok(html.includes('data-color="'+theme.color.text+'"'));
    }
    let resolve;const ready=new Promise(r=>{resolve=r;});
    function Delayed(){use(ready);return fallback();}
    const stream=new PassThrough();let html='';stream.setEncoding('utf8').on('data',chunk=>{html+=chunk;});
    const ended=new Promise((resolve,reject)=>stream.once('end',resolve).once('error',reject));
    const errors=[];
    const rendered=renderToPipeableStream(h(ThemeContext.Provider,{value:{}},h(Suspense,{fallback:h('p',null,'Loading')},h(Delayed))),{
      onShellReady(){rendered.pipe(stream)},onError(error){errors.push(error)}
    });
    setTimeout(resolve,10);await ended;
    assert.deepEqual(errors,[]);
    assert.match(html,/data-mode="light"/);
    assert.match(html,/data-height="2.75rem"/);
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30_000,
  });
});

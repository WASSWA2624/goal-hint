import { concepts, stages } from './catalog.js';

const packages = [
  { id: 'daily', name: 'Daily', duration: '24 hours', price: 1000 },
  { id: 'weekly', name: 'Weekly', duration: '7 days', price: 5000 },
  { id: 'monthly', name: 'Monthly', duration: '30 days', price: 20000 },
];
const networks = [
  { id: 'mtn', name: 'MTN MoMo', number: '077X XXX XXX', asset: 'mtn-momo.jpg', className: 'mtn' },
  { id: 'airtel', name: 'Airtel Money', number: '075X XXX XXX', asset: 'airtel-money.svg', className: 'airtel' },
];
const headings = ['Choose a package', 'Choose how to pay', 'Add payment proof', 'Review your payment'];
const questions = ['Which package?', 'MTN or Airtel?', 'Can you add your proof?', 'Ready to submit?'];
const guidance = [
  'Choose how long you need access.',
  'Choose MTN or Airtel. Pay to the number shown.',
  'Add your sending number and screenshot.',
  'Check your details, then submit.',
];
const money = value => `UGX ${value.toLocaleString('en-UG')}`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, size = 20) => {
  const paths = { arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', back: '<path d="M19 12H5m5-5-5 5 5 5"/>', check: '<path d="m5 12 4 4L19 6"/>', upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>', copy: '<rect x="8" y="8" width="12" height="12"/><path d="M16 8V4H4v12h4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', lock: '<rect x="5" y="10" width="14" height="11"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>', help: '<path d="M4 4h16v13H9l-5 4V4Z"/><path d="M8 9h8m-8 4h5"/>' };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="square" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};

export function mountFlow(root, id, embedded = false) {
  const concept = concepts.find(item => item.id === id) || concepts[0];
  const state = { step: 0, plan: '', network: '', phone: '', file: null, preview: '', confirmed: false, submitted: false, errors: {}, reading: false };
  let proofVersion = 0;
  let supportOpen = false;
  let receipt = '';
  const selectedPlan = () => packages.find(item => item.id === state.plan);
  const selectedNetwork = () => networks.find(item => item.id === state.network);
  const brand = () => `<a class="flow-brand" href="./index.html" ${embedded ? 'target="_top"' : ''}><img src="./assets/goal-hint-mark.svg" alt="" width="29" height="29"><span>Goal Hint<span class="brand-separator">/</span><small>Get access</small></span></a>`;
  const summaries = () => [selectedPlan() ? `${selectedPlan().name} · ${money(selectedPlan().price)}` : 'Choose a package', selectedNetwork()?.name || 'Select MTN or Airtel', state.file ? 'Payment proof added' : 'Add your sending number', 'Check your details'];
  const badge = () => '<span class="manual-label">Manual payment</span>';

  function progress() {
    if (concept.key === 'question' || concept.key === 'dock') return `<div class="meter"><div class="meter-copy"><span>Step ${state.step + 1} of 4</span><span>${stages[state.step]}</span></div><div class="meter-track"><span style="width:${(state.step + 1) * 25}%"></span></div></div>`;
    if (concept.key === 'trail') return `<nav class="page-trail" aria-label="Payment progress">${stages.map((stage, index) => `${index ? '<span aria-hidden="true">/</span>' : ''}<span ${index === state.step ? 'aria-current="step"' : ''} class="${index <= state.step ? 'reached' : ''}">${stage}</span>`).join('')}</nav>`;
    return `<nav class="step-progress" aria-label="Payment progress"><ol>${stages.map((stage, index) => `<li class="${index === state.step ? 'active' : index < state.step ? 'complete' : ''}" ${index === state.step ? 'aria-current="step"' : ''}><span class="step-number">${index < state.step ? icon('check', 13) : index + 1}</span><span>${stage}</span></li>`).join('')}</ol></nav>`;
  }

  function error(field) {
    return state.errors[field] ? `<p class="field-error" id="${field}-error" role="alert" tabindex="-1">${escape(state.errors[field])}</p>` : '';
  }

  function packageStep() {
    return `<fieldset class="choices package-choices"><legend class="sr-only">Choose a package</legend>${packages.map(plan => `<label class="choice package-choice ${state.plan === plan.id ? 'selected' : ''}"><input type="radio" name="package" value="${plan.id}" ${state.plan === plan.id ? 'checked' : ''}><span class="choice-copy"><span class="choice-title">${plan.name}<span class="duration">${plan.duration}</span></span></span><span class="price">${money(plan.price)}</span><span class="choice-check">${icon('check', 14)}</span></label>`).join('')}</fieldset>${error('plan')}<p class="field-hint quiet-note">${icon('lock', 15)} Access starts after approval.</p>`;
  }

  function payStep() {
    const network = selectedNetwork();
    return `<fieldset class="choices network-choices"><legend class="sr-only">Payment method</legend>${networks.map(item => `<label class="choice network-choice ${state.network === item.id ? 'selected' : ''}"><input type="radio" name="network" value="${item.id}" ${state.network === item.id ? 'checked' : ''}><span class="network-logo ${item.className}"><img src="./assets/${item.asset}" alt=""></span><span class="choice-copy"><span class="choice-title">${item.name}</span></span><span class="choice-check">${icon('check', 14)}</span></label>`).join('')}</fieldset>${error('network')}${network ? `<section class="pay-instructions" aria-label="Payment instructions"><div class="pay-amount"><span>Amount to send</span><strong>${money(selectedPlan().price)}</strong></div><div class="recipient"><span class="field-label">Pay to</span><div class="recipient-number"><strong>${network.number}</strong><button type="button" class="icon-button" data-action="copy" aria-label="Copy demo recipient number">${icon('copy')}</button></div><div class="recipient-name">Name: <strong>GOAL HINT DEMO</strong></div><span class="demo-number">Demo number · do not pay</span></div><p class="pay-directions">Pay manually. Save your screenshot.</p></section>` : ''}`;
  }

  function proofStep() {
    return `<div class="field"><label class="field-label" for="payer-phone">Number used to pay</label><input class="phone-input" id="payer-phone" name="payerPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="e.g. 0770 000 000" value="${escape(state.phone)}" ${state.errors.phone ? 'aria-describedby="phone-error"' : ''} ${state.errors.phone ? 'aria-invalid="true"' : ''}>${error('phone')}</div><div class="field"><label class="field-label" for="payment-proof">Payment screenshot</label><p class="field-hint" id="proof-hint">JPG, PNG or WebP · Max 3 MB</p><label class="upload-zone ${state.file ? 'has-proof' : ''}" for="payment-proof">${state.file ? `<img class="proof-thumbnail" src="${state.preview}" alt="Preview of your selected payment screenshot"><span><strong>${escape(state.file.name)}</strong><small>${Math.max(1, Math.round(state.file.size / 1024))} KB · Replace</small></span>${icon('check')}` : `${icon('upload', 27)}<span><strong>${state.reading ? 'Checking…' : 'Upload screenshot'}</strong></span>`}<input type="file" id="payment-proof" name="screenshot" accept="image/jpeg,image/png,image/webp" ${state.reading ? 'disabled' : ''} aria-describedby="proof-hint${state.errors.file ? ' file-error' : ''}" ${state.errors.file ? 'aria-invalid="true"' : ''}></label>${error('file')}</div><button type="button" class="demo-fill" data-action="demo" ${state.reading ? 'disabled' : ''}>Use demo details ${icon('arrow', 15)}</button>`;
  }

  function reviewStep() {
    const plan = selectedPlan(), network = selectedNetwork();
    return `<section class="review-receipt" aria-label="Payment review"><div class="review-total"><span>${plan.name} · ${plan.duration}</span><strong>${money(plan.price)}</strong></div><dl class="review-details"><div><dt>Package</dt><dd>${plan.name}<button type="button" data-edit="0">Edit<span class="sr-only"> package</span></button></dd></div><div><dt>Payment method</dt><dd>${network.name}<button type="button" data-edit="1">Edit<span class="sr-only"> payment method</span></button></dd></div><div><dt>Recipient</dt><dd>${network.number}</dd></div><div><dt>Paid from</dt><dd>${escape(state.phone)}<button type="button" data-edit="2">Edit<span class="sr-only"> payer phone</span></button></dd></div><div><dt>Screenshot</dt><dd><span class="review-file">${icon('check', 14)} ${escape(state.file.name)}</span><button type="button" data-edit="2">Edit<span class="sr-only"> screenshot</span></button></dd></div></dl><img class="review-preview" src="${state.preview}" alt="Your payment screenshot for review"></section><label class="confirm-choice"><input type="checkbox" name="confirmed" ${state.confirmed ? 'checked' : ''}><span>I’ve paid and checked these details.</span></label>${error('confirmed')}`;
  }

  function actions() {
    const labels = ['Continue', 'I’ve paid', 'Review', 'Submit proof'];
    return `<div class="flow-actions">${state.step > 0 ? `<button type="button" class="back-button" data-action="back">${icon('back', 17)} Back</button>` : '<span class="action-note"></span>'}<button type="submit" class="primary-button" ${state.reading ? 'disabled' : ''}>${labels[state.step]}${icon(state.step === 3 ? 'check' : 'arrow', 17)}</button></div>`;
  }

  function stageContent() {
    return `<div class="stage-heading"><h1 id="stage-title" tabindex="-1">${concept.key === 'question' ? questions[state.step] : headings[state.step]}</h1></div><form id="payment-form" novalidate><div class="stage-fields">${[packageStep, payStep, proofStep, reviewStep][state.step]()}</div>${actions()}</form>`;
  }

  function rail() {
    return `<aside class="journey-rail"><div class="eyebrow">YOUR PAYMENT</div><h2>Get access.</h2><ol>${stages.map((label, index) => `<li class="${index === state.step ? 'active' : index < state.step ? 'complete' : ''}" ${index === state.step ? 'aria-current="step"' : ''}><span class="rail-number">${index < state.step ? icon('check', 15) : index + 1}</span><div><strong>${label}</strong><small>${index < state.step ? escape(summaries()[index]) : ['Choose your access', 'Send payment manually', 'Share your screenshot', 'Send for verification'][index]}</small></div>${index < state.step ? `<button type="button" data-edit="${index}" aria-label="Edit ${label.toLowerCase()}">Edit</button>` : ''}</li>`).join('')}</ol><p>${icon('lock', 15)} One step at a time.</p></aside>`;
  }

  function folded() {
    return `<div class="folded-steps">${stages.map((stage, index) => `<section class="folded-section ${index === state.step ? 'active' : index < state.step ? 'complete' : ''}"><div class="folded-label"><span class="fold-number">${index < state.step ? icon('check', 17) : index + 1}</span><div><strong>${['Choose package', 'Make payment', 'Add payment proof', 'Review and submit'][index]}</strong>${index < state.step ? `<small>${escape(summaries()[index])}</small>` : ''}</div>${index < state.step ? `<button type="button" data-edit="${index}">Edit<span class="sr-only"> ${stage.toLowerCase()}</span></button>` : `<span class="fold-state">${index === state.step ? 'Current' : 'Up next'}</span>`}</div>${index === state.step ? `<main class="flow-main">${stageContent()}</main>` : ''}</section>`).join('')}</div>`;
  }

  function composition() {
    switch (concept.key) {
      case 'rail': return `<div class="flow-layout">${rail()}<main class="flow-main">${stageContent()}</main></div>`;
      case 'accordion': case 'timeline': return folded();
      case 'pass': return `<div class="payment-pass"><aside class="pass-stub"><div class="eyebrow">YOUR ACCESS PASS</div><div class="pass-symbol">GH<span>+</span></div><strong>${selectedPlan()?.name || 'Choose your access'}</strong><span>${selectedPlan() ? money(selectedPlan().price) : 'One package. Full access.'}</span><div class="pass-rule"></div>${progress()}<span class="pass-footer">GOAL HINT / MOBILE MONEY</span></aside><main class="flow-main">${stageContent()}</main></div>`;
      case 'guide': return `<div class="guided-layout"><aside class="helpful-guide"><div class="guide-avatar">GH</div><span class="eyebrow">GOAL HINT</span><h2>Here to help.</h2><p>${guidance[state.step]}</p><div class="guide-completed">${summaries().slice(0, state.step).map((summary, index) => `<button type="button" data-edit="${index}">${icon('check', 15)}${escape(summary)}<span>Edit</span></button>`).join('')}</div>${progress()}</aside><main class="flow-main">${stageContent()}</main></div>`;
      case 'trail': return `<div class="trail-layout"><main class="flow-main">${progress()}${stageContent()}</main><aside class="trail-note"><span class="eyebrow">GOOD TO KNOW</span><h2>Full access.</h2><p>We review your proof before activating access.</p></aside></div>`;
      default: return `<main class="flow-main">${progress()}${stageContent()}</main>`;
    }
  }

  function success() {
    return `<main class="success-card"><div class="status-icon">${icon('clock', 28)}</div><div class="eyebrow">DEMO</div><h1 id="stage-title" tabindex="-1">Proof submitted</h1><div class="pending-status"><span class="status-dot"></span>Awaiting verification <span class="demo-tag">Demo</span></div><dl class="status-summary"><div><dt>Reference</dt><dd>${receipt}</dd></div><div><dt>Package</dt><dd>${selectedPlan().name} · ${money(selectedPlan().price)}</dd></div><div><dt>Payment method</dt><dd>${selectedNetwork().name}</dd></div><div><dt>Paid from</dt><dd>${escape(state.phone)}</dd></div></dl><div class="status-explanation">${icon('lock', 18)}<p>Access starts after approval.</p></div><button type="button" class="primary-button support-button" data-action="support">${icon('help', 18)}Contact support</button>${supportOpen ? `<div class="support-preview" role="status"><strong>Support preview</strong><p>Please check ${receipt}: ${selectedPlan().name}, ${money(selectedPlan().price)}, ${selectedNetwork().name}.</p><small>Demo only. No message sent.</small></div>` : ''}<div class="success-links"><button type="button" data-action="correction">Edit details</button><button type="button" data-action="restart">Try again</button></div><p class="privacy-note">Demo only. Nothing sent.</p></main>`;
  }

  function render(focus = false) {
    document.title = `${concept.id} · ${concept.name} · Goal Hint`;
    root.innerHTML = `<div class="flow flow--${concept.key} ${embedded ? 'is-embedded' : 'is-standalone'}"><div class="demo-ribbon"><span>DESIGN SAMPLE</span> No money or files sent.${!embedded ? '<a href="./index.html">All 10 samples →</a>' : ''}</div>${concept.key === 'window' ? '<div class="quiet-app-shell" aria-hidden="true"><span>GOAL HINT</span><span>Matches &nbsp; Predictions &nbsp; Account</span></div>' : ''}<header class="flow-header">${brand()}${badge()}</header><div class="flow-body">${state.submitted ? success() : composition()}</div><footer class="flow-footer"><span>Goal Hint</span><span>Sample ${concept.id} · ${concept.name}</span></footer><div class="flow-toast" role="status" aria-live="polite"></div></div>`;
    for (const [field, selector] of [['plan', '.package-choices'], ['network', '.network-choices'], ['confirmed', 'input[name="confirmed"]']]) {
      if (state.errors[field]) {
        const group = root.querySelector(selector);
        group?.setAttribute('aria-invalid', 'true');
        group?.setAttribute('aria-describedby', `${field}-error`);
      }
    }
    if (focus) {
      root.querySelector('#stage-title')?.focus({ preventScroll: true });
      if (!state.errors.phone && !state.errors.file && !state.errors.confirmed) window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function toast(message) {
    const el = root.querySelector('.flow-toast');
    el.textContent = message;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3000);
  }

  function phoneValid() {
    return /^(?:0[37]\d{8}|256[37]\d{8})$/.test(state.phone.replace(/[\s+()-]/g, ''));
  }

  function validate() {
    state.errors = {};
    if (state.step === 0 && !state.plan) state.errors.plan = 'Choose a package to continue.';
    if (state.step === 1 && !state.network) state.errors.network = 'Choose MTN or Airtel to continue.';
    if (state.step === 2) {
      if (!phoneValid()) state.errors.phone = 'Enter a valid number, e.g. 0770 000 000.';
      if (!state.file) state.errors.file = 'Add a screenshot or use demo details.';
    }
    if (state.step === 3 && !state.confirmed) state.errors.confirmed = 'Confirm your payment details.';
    if (Object.keys(state.errors).length) {
      render();
      const invalid = state.errors.plan ? root.querySelector('input[name="package"]')
        : state.errors.network ? root.querySelector('input[name="network"]')
        : root.querySelector('[aria-invalid="true"], .field-error, input[name="confirmed"]');
      invalid?.focus();
      root.querySelector('.field-error')?.scrollIntoView({ block: 'nearest' });
      return false;
    }
    return true;
  }

  async function chooseFile(file, version = ++proofVersion) {
    if (version !== proofVersion) return;
    state.errors.file = '';
    if (!file) return;
    let errorMessage = '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) errorMessage = 'Choose a JPG, PNG, or WebP image.';
    else if (file.size > 3_000_000) errorMessage = 'This image is too large. Choose one smaller than 3 MB.';
    if (errorMessage) {
      if (state.preview) URL.revokeObjectURL(state.preview);
      state.file = null; state.preview = ''; state.errors.file = errorMessage; render(); return;
    }
    state.reading = true;
    render();
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      if (version !== proofVersion) { URL.revokeObjectURL(url); return; }
      if (state.preview) URL.revokeObjectURL(state.preview);
      state.file = file; state.preview = url; state.confirmed = false;
    } catch {
      URL.revokeObjectURL(url);
      if (version !== proofVersion) return;
      if (state.preview) URL.revokeObjectURL(state.preview);
      state.file = null; state.preview = ''; state.errors.file = 'This image could not be opened. Choose another screenshot.';
    }
    state.reading = false; render();
    if (state.step === 2) root.querySelector('#payment-proof')?.focus({ preventScroll: true });
  }

  async function demoDetails() {
    const version = ++proofVersion;
    state.reading = true;
    state.phone = '0770 000 000'; state.errors = {};
    render();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f7f6'; ctx.fillRect(0, 0, 640, 800);
    ctx.fillStyle = '#061747'; ctx.fillRect(0, 0, 640, 140);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText('GOAL HINT / DEMO RECEIPT', 38, 83);
    ctx.fillStyle = '#007c74'; ctx.font = 'bold 32px sans-serif'; ctx.fillText('Payment screenshot sample', 38, 215);
    ctx.fillStyle = '#061747'; ctx.font = 'bold 50px sans-serif'; ctx.fillText(money(selectedPlan().price), 38, 305);
    ctx.font = '25px sans-serif';
    [selectedNetwork().name, `${selectedPlan().name} package`, 'From: 0770 000 000', 'To: GOAL HINT DEMO', 'Sample reference: DEMO1234'].forEach((line, i) => ctx.fillText(line, 38, 380 + i * 55));
    ctx.fillStyle = '#596575'; ctx.font = '22px sans-serif'; ctx.fillText('DESIGN SAMPLE — NO MONEY TRANSFERRED', 38, 745);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (version !== proofVersion) return;
    if (blob) await chooseFile(new File([blob], 'demo-payment.png', { type: 'image/png' }), version);
    else { state.reading = false; render(); toast('Demo image unavailable. Choose your own screenshot.'); }
  }

  root.addEventListener('input', event => {
    if (event.target.name === 'payerPhone') { state.phone = event.target.value; state.confirmed = false; }
  });
  root.addEventListener('change', event => {
    const field = event.target;
    if (field.name === 'package' || field.name === 'network') {
      const key = field.name === 'package' ? 'plan' : 'network';
      const changed = state[key] !== field.value;
      const proofChanged = changed && (state.file || state.reading);
      if (changed) { proofVersion += 1; state.reading = false; }
      if (proofChanged) {
        if (state.preview) URL.revokeObjectURL(state.preview);
        state.file = null; state.preview = '';
      }
      state[key] = field.value;
      state.confirmed = false; state.errors = {}; render();
      root.querySelector(`input[name="${field.name}"]:checked`)?.focus({ preventScroll: true });
      if (proofChanged) toast('Details changed. Add a new screenshot.');
    }
    if (field.name === 'confirmed') { state.confirmed = field.checked; delete state.errors.confirmed; }
    if (field.name === 'screenshot') void chooseFile(field.files?.[0]);
  });
  root.addEventListener('submit', event => {
    if (event.target.id !== 'payment-form') return;
    event.preventDefault();
    if (state.reading || !validate()) return;
    if (state.step === 3) { state.submitted = true; receipt = `DEMO-${concept.id}-0001`; supportOpen = false; }
    else state.step += 1;
    state.errors = {}; render(true);
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.edit !== undefined) {
      const next = Number(button.dataset.edit);
      if (next < state.step) { state.step = next; state.confirmed = false; state.errors = {}; render(true); }
      return;
    }
    switch (button.dataset.action) {
      case 'back': state.step = Math.max(0, state.step - 1); state.errors = {}; render(true); break;
      case 'demo': await demoDetails(); break;
      case 'copy':
        try { await navigator.clipboard.writeText(selectedNetwork().number); toast('Demo number copied.'); }
        catch { toast('Copy unavailable. The demo number is shown above.'); }
        break;
      case 'support': supportOpen = !supportOpen; render(); root.querySelector('.support-preview')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); break;
      case 'correction': state.submitted = false; state.step = 2; state.confirmed = false; render(true); break;
      case 'restart':
        proofVersion += 1;
        if (state.preview) URL.revokeObjectURL(state.preview);
        Object.assign(state, { step: 0, plan: '', network: '', phone: '', file: null, preview: '', confirmed: false, submitted: false, errors: {}, reading: false });
        supportOpen = false; render(true); break;
    }
  });
  render();
}

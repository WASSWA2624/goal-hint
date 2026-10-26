import { concepts } from './catalog.js';

const favoriteKey = 'goal-hint.payment-flow-favorites.v1';
const icons = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 12H5m5-5-5 5 5 5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19"/><path d="M10 18h4"/></svg>',
  desktop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 4h18v12H3ZM8 21h8m-4-5v5"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14m-1-9H3v16h16v-6"/></svg>',
};
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const brand = () => '<a class="studio-brand" href="#/gallery" aria-label="Goal Hint payment flow gallery"><img src="./assets/goal-hint-mark.svg" width="31" height="31" alt=""><span>Goal Hint<span class="studio-brand-caption">Design studio</span></span></a>';
const miniChoices = () => '<div class="mini-choices"><span class="mini-choice selected"><i></i>Daily<b>1,000</b></span><span class="mini-choice"><i></i>Weekly<b>5,000</b></span><span class="mini-choice"><i></i>Monthly<b>20,000</b></span></div>';
const miniSteps = () => '<div class="mini-steps"><i class="active">1</i><span></span><i>2</i><span></span><i>3</i><span></span><i>4</i></div>';
const miniButton = () => '<div class="mini-button">Continue <span>→</span></div>';
const miniRail = () => '<div class="mini-rail"><span class="active"><i>1</i>Package</span><span><i>2</i>Pay</span><span><i>3</i>Proof</span><span><i>4</i>Review</span></div>';

function miniature(concept) {
  const main = `<div class="mini-main"><small>STEP 1 OF 4</small><strong>Choose your package</strong>${miniChoices()}${miniButton()}</div>`;
  const panels = {
    focus: `<div class="mini-sheet">${miniSteps()}${main}</div>`,
    rail: `<div class="mini-sheet mini-sheet-wide">${miniRail()}${main}</div>`,
    question: `<div class="mini-question"><small>01 / 04</small><strong>Which package<br>would you like?</strong>${miniChoices()}${miniButton()}</div>`,
    accordion: `<div class="mini-accordion"><div class="mini-open"><strong><i>1</i>Choose a package</strong>${miniChoices()}${miniButton()}</div><span><i>2</i>Pay manually<b>+</b></span><span><i>3</i>Add proof<b>+</b></span><span><i>4</i>Review<b>+</b></span></div>`,
    pass: `<div class="mini-pass"><div class="mini-pass-head"><small>YOUR ACCESS PASS</small><strong>Goal Hint</strong><span>Choose a package to begin</span></div><div class="mini-pass-body"><small>1 / 4 · PACKAGE</small>${miniChoices()}${miniButton()}</div></div>`,
    timeline: `<div class="mini-timeline"><div class="mini-line"><i class="active">1</i><i>2</i><i>3</i><i>4</i></div><div><div class="mini-timeline-task"><strong>Choose a package</strong>${miniChoices()}${miniButton()}</div><span>Pay manually</span><span>Add proof</span><span>Review & submit</span></div></div>`,
    dock: `<div class="mini-dock"><div>${miniSteps()}<strong>Choose your package</strong>${miniChoices()}</div><div class="mini-dock-footer"><span>1 / 4</span>${miniButton()}</div></div>`,
    trail: `<div class="mini-trail"><div class="mini-breadcrumb"><b>Package</b> › Pay › Proof › Review</div><div class="mini-trail-content"><div>${main}</div><aside><small>YOUR PAYMENT</small><span>Four simple steps.</span><span>You're in control.</span></aside></div></div>`,
    window: `<div class="mini-window-shell"><div class="mini-app-bar"></div><div class="mini-window"><div class="mini-window-top"><b>Get access</b><span>×</span></div>${miniSteps()}${main}</div></div>`,
    guide: `<div class="mini-guide"><div class="mini-guide-note"><span>GH</span><strong>Let's choose<br>your package.</strong><small>All packages include<br>the same features.</small></div><div class="mini-guide-answer"><small>YOUR ANSWER · 1 / 4</small>${miniChoices()}${miniButton()}</div></div>`,
  };
  return `<div class="concept-preview concept-preview--${concept.key}" aria-hidden="true">${panels[concept.key]}</div>`;
}

export function mountGallery(root) {
  let favorites = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(favoriteKey) || '[]');
    if (Array.isArray(stored)) favorites = new Set(stored.filter((id) => concepts.some((concept) => concept.id === id)));
  } catch { /* Favorites are optional when browser storage is unavailable. */ }
  let filter = 'all';
  let device = window.innerWidth < 700 ? 'mobile' : 'desktop';
  const notice = 'Demo only. No payment or proof is sent.';

  function favoriteButton(concept, compact = false) {
    const saved = favorites.has(concept.id);
    return `<button type="button" class="${compact ? 'concept-save' : 'studio-button studio-save'}${saved ? ' is-saved' : ''}" data-action="favorite" data-id="${concept.id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Save'} ${escape(concept.name)}${saved ? ' from favorites' : ' to favorites'}">${icons.star}${compact ? '' : `<span>${saved ? 'Saved' : 'Save favorite'}</span>`}</button>`;
  }

  function gallery() {
    const visible = concepts.filter((concept) => filter === 'all' || favorites.has(concept.id));
    root.innerHTML = `<div class="studio gallery">
      <header class="studio-header">${brand()}<span class="studio-header-note"><span class="studio-live-dot"></span>Payment experience / 10 concepts</span></header>
      <main class="gallery-main">
        <section class="gallery-hero" aria-labelledby="gallery-title">
          <div><p class="studio-eyebrow">EASIER TO PAY.</p><h1 id="gallery-title">One payment.<br><span>Ten simpler paths.</span></h1><p class="gallery-intro">Try each flow on mobile or desktop, then save your favorites.</p></div>
          <div class="gallery-journey"><p class="studio-eyebrow">FOUR SIMPLE STEPS</p><ol><li><span>01</span><div><strong>Choose a package</strong></div></li><li><span>02</span><div><strong>Pay with MTN or Airtel</strong></div></li><li><span>03</span><div><strong>Add payment proof</strong></div></li><li><span>04</span><div><strong>Review and send</strong></div></li></ol></div>
        </section>
        <section aria-label="Payment flow concepts"><div class="gallery-controls"><div class="gallery-tabs" role="group" aria-label="Filter concepts"><button type="button" data-action="filter" data-filter="all" aria-pressed="${filter === 'all'}">All samples <span>10</span></button><button type="button" data-action="filter" data-filter="saved" aria-pressed="${filter === 'saved'}">${icons.star}Saved <span>${favorites.size}</span></button></div><p>Mobile & desktop</p></div>
        ${visible.length ? `<div class="concept-grid">${visible.map((concept) => `<article class="concept-card"><div class="concept-topline"><span class="concept-number">${concept.id}</span><span class="concept-tag">${concept.tag}</span>${favoriteButton(concept, true)}</div><a class="concept-main-link" href="#/sample/${concept.id}" aria-label="Try sample ${concept.id}: ${escape(concept.name)}">${miniature(concept)}<div class="concept-copy"><div class="concept-title-row"><h2>${escape(concept.name)}</h2>${concept.recommended ? '<span class="concept-recommended" title="A good place to start">Start here</span>' : ''}</div><p>${escape(concept.description)}</p><span class="concept-open">Open sample ${icons.arrow}</span></div></a></article>`).join('')}</div>` : '<div class="gallery-empty"><span>☆</span><h2>No saved samples.</h2><p>Tap a star to save a favorite.</p><button class="studio-button studio-button-primary" data-action="filter" data-filter="all">View samples</button></div>'}
        </section>
        <aside class="gallery-demo-note"><span class="studio-demo-label">DEMO</span><p>${notice} Example prices and wallets.</p></aside>
      </main><footer class="studio-footer"><span>Goal Hint · Payment samples</span></footer>
    </div>`;
  }

  function workbench(concept) {
    const index = concepts.indexOf(concept);
    root.innerHTML = `<div class="studio workbench"><header class="studio-header">${brand()}<a class="studio-back-link" href="#/gallery">${icons.back}All samples</a></header>
      <main class="workbench-main"><div class="workbench-heading"><div><p class="studio-eyebrow">SAMPLE ${concept.id} / 10 · ${escape(concept.tag)}</p><h1>${escape(concept.name)}</h1><p>${escape(concept.description)}</p></div><div class="workbench-actions">${favoriteButton(concept)}<button class="studio-button" type="button" data-action="copy-link">Copy link</button></div></div>
      <div class="preview-toolbar"><div class="sample-picker"><label for="sample-select">Sample</label><select id="sample-select" aria-label="Choose a payment flow sample">${concepts.map((option) => `<option value="${option.id}"${option === concept ? ' selected' : ''}>${option.id} — ${escape(option.name)}</option>`).join('')}</select></div><div class="preview-device-controls" role="group" aria-label="Preview screen size"><button type="button" data-action="device" data-device="mobile" aria-pressed="${device === 'mobile'}">${icons.phone}<span>Mobile</span></button><button type="button" data-action="device" data-device="desktop" aria-pressed="${device === 'desktop'}">${icons.desktop}<span>Desktop</span></button></div><a class="studio-button preview-fullscreen" href="?flow=${concept.id}" target="_blank" rel="noopener">${icons.external}<span>Open full screen</span><span class="studio-sr-only"> in a new tab</span></a></div>
      <div class="preview-stage" data-device="${device}"><div class="preview-viewport"><div class="preview-browser-bar"><span></span><span>Goal Hint / payment</span><span class="preview-size">${device === 'mobile' ? '390px' : 'Responsive'}</span></div><iframe class="preview-frame" src="?flow=${concept.id}&embed=1" title="Interactive preview of ${escape(concept.name)}" loading="eager"></iframe></div></div>
      <div class="workbench-bottom"><p><span class="studio-demo-label">DEMO</span>No payment or proof is sent.</p><nav aria-label="Browse payment samples"><a href="#/sample/${concepts[(index + concepts.length - 1) % concepts.length].id}" aria-label="Previous sample">${icons.back}<span>Previous</span></a><span>${concept.id} / 10</span><a href="#/sample/${concepts[(index + 1) % concepts.length].id}" aria-label="Next sample"><span>Next</span>${icons.arrow}</a></nav></div><p class="studio-live-status" role="status" aria-live="polite"></p>
      </main></div>`;
  }

  function render() {
    const id = /^#\/sample\/(\d{2})$/.exec(location.hash)?.[1];
    const concept = concepts.find((item) => item.id === id);
    document.title = concept ? `${concept.name} · Goal Hint payment samples` : 'Payment flow samples · Goal Hint';
    if (concept) workbench(concept);
    else gallery();
  }

  function announce(message) {
    const status = root.querySelector('.studio-live-status');
    if (status) status.textContent = message;
  }

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !root.contains(button)) return;
    switch (button.dataset.action) {
      case 'favorite': {
        const id = button.dataset.id;
        if (favorites.has(id)) favorites.delete(id);
        else favorites.add(id);
        try { localStorage.setItem(favoriteKey, JSON.stringify([...favorites])); } catch { /* Keep in-memory favorites functional. */ }
        if (root.querySelector('.workbench')) {
          const concept = concepts.find((item) => item.id === id);
          const holder = document.createElement('div');
          holder.innerHTML = favoriteButton(concept);
          const next = holder.firstElementChild;
          button.replaceWith(next);
          next.focus();
          announce(favorites.has(id) ? 'Saved on this browser.' : 'Removed from favorites.');
        } else {
          const scroll = window.scrollY;
          gallery();
          root.querySelector(`[data-action="favorite"][data-id="${id}"]`)?.focus({ preventScroll: true });
          window.scrollTo({ top: scroll });
        }
        break;
      }
      case 'filter': filter = button.dataset.filter; gallery(); root.querySelector(`[data-action="filter"][data-filter="${filter}"]`)?.focus({ preventScroll: true }); break;
      case 'device': {
        device = button.dataset.device;
        root.querySelector('.preview-stage').dataset.device = device;
        root.querySelectorAll('[data-action="device"]').forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.device === device)));
        root.querySelector('.preview-size').textContent = device === 'mobile' ? '390px' : 'Responsive';
        break;
      }
      case 'copy-link': {
        try { await navigator.clipboard.writeText(location.href); announce('Link copied.'); }
        catch { announce('Copy the browser address to share.'); }
        break;
      }
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'sample-select') location.hash = `#/sample/${event.target.value}`;
  });
  root.addEventListener('load', (event) => {
    if (event.target.matches?.('.preview-frame')) event.target.dataset.ready = 'true';
  }, true);
  window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
  render();
}

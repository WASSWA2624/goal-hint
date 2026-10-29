import { concepts } from './catalog.js';

const $ = (id) => document.getElementById(id);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const money = (amount) => `UGX ${new Intl.NumberFormat('en-UG').format(amount)}`;
const statuses = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', replaced: 'Replaced reports' };
const statusLabel = (status) => status === 'replaced' ? 'Replaced report' : statuses[status];
const networkName = (network) => network === 'mtn' ? 'MTN MoMo' : 'Airtel Money';
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Optional preferences work without storage. */ } },
};
const savedShortlist = storage.get('goal-hint.admin-payment-layouts.shortlist.v1', []);
const state = {
  concept: concepts[0], status: 'pending', search: '', provider: 'all', sort: 'newest',
  selected: {}, edits: new Map(),
  shortlist: new Set(Array.isArray(savedShortlist) ? savedShortlist.filter((id) => concepts.some((concept) => concept.id === id)) : []),
};

const iconPaths = {
  check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13"/><path d="M16 8V3H3v13h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3v1"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true">${iconPaths[name] || iconPaths.check}</svg>`;
export function networkMark(network) {
  return `<span class="network-mark network-mark--${network}" role="img" aria-label="${networkName(network)}">${network === 'mtn'
    ? '<span class="mtn-crop"><img src="../payment-networks/mtn-momo.jpg" alt="" width="557" height="359"></span>'
    : '<img src="../payment-networks/airtel-money.svg" alt="" width="55" height="57">'}</span>`;
}

const packages = [
  { name: 'Weekly', duration: '7 days', amount: 5000 },
  { name: 'Monthly', duration: '30 days', amount: 20000 },
  { name: 'Daily', duration: '1 day', amount: 1000 },
  { name: 'Quarterly', duration: '90 days', amount: 50000 },
];
const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateLabel = (value) => dateFormatter.format(new Date(value)).replace(',', ' ·') + ' EAT';
const payments = Object.keys(statuses).flatMap((status, statusIndex) => Array.from({ length: 20 }, (_, index) => {
  const plan = packages[index % packages.length];
  const sequence = statusIndex * 100 + index + 1;
  const network = index % 3 === 1 ? 'airtel' : 'mtn';
  const warning = status === 'pending' && index % 7 === 4;
  return {
    id: `GH-${26000 + sequence}`, status, network, phone: `+256 ${network === 'mtn' ? '770' : '750'} 000 ${String(100 + sequence).padStart(3, '0')}`,
    transaction: `${network === 'mtn' ? 'MTN' : 'AM'}-DEMO-${String(sequence).padStart(6, '0')}`,
    plan: plan.name, duration: plan.duration, expected: plan.amount, amount: plan.amount + (warning ? 1000 : 0), warning,
    timestamp: new Date(Date.UTC(2026, 9, 29, 9, 42) - index * 37 * 60000 - statusIndex * 86400000).toISOString(),
    account: `Demo subscriber ${String(sequence).padStart(2, '0')}`, credit: index % 4 === 2 ? 2000 : 0,
  };
}));

let toastTimer;
function toast(message) {
  const element = $('toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  element.classList.add('is-visible');
  toastTimer = setTimeout(() => { element.classList.remove('is-visible'); element.hidden = true; }, 4500);
}

function visiblePayments() {
  const query = state.search.toLowerCase().replace(/[\s()+.-]/g, '');
  return payments.filter((payment) => payment.status === state.status && (state.provider === 'all' || payment.network === state.provider)
    && (!query || [payment.id, payment.phone, payment.plan, payment.transaction, networkName(payment.network)].join(' ').toLowerCase().replace(/[\s()+.-]/g, '').includes(query)))
    .sort((a, b) => state.sort === 'amount' ? b.amount - a.amount || b.timestamp.localeCompare(a.timestamp)
      : state.sort === 'oldest' ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp));
}

function paymentRow(payment) {
  return `<button type="button" class="payment-row" aria-current="${state.selected[state.status] === payment.id}" aria-controls="detail-content" data-payment="${payment.id}">
    ${networkMark(payment.network)}<span class="payment-main"><span class="payment-ref">${payment.id}<span class="network-name">${networkName(payment.network)}</span></span>
    <span class="payment-phone">${payment.phone}</span><span class="payment-time">${dateLabel(payment.timestamp)}</span></span>
    <span class="payment-side"><strong class="payment-amount">${money(payment.amount)}</strong><span class="payment-plan">${payment.plan} · ${payment.duration}</span>
    <span class="row-indicator${payment.warning ? ' has-warning' : ''}">${payment.warning ? `${icon('alert')}Check amount` : state.status === 'pending' ? `${icon('clock')}Awaiting review` : `${icon(state.status === 'approved' ? 'check' : state.status === 'rejected' ? 'close' : 'arrow')}${statusLabel(state.status)}`}</span></span></button>`;
}

function renderTabs() {
  $('status-tabs').innerHTML = Object.entries(statuses).map(([status, label]) => `<button type="button" data-status-tab="${status}" aria-current="${state.status === status ? 'page' : 'false'}">${label}<span class="tab-count">20</span></button>`).join('');
}

function renderList() {
  const visible = visiblePayments();
  const previous = $('detail-content').dataset.payment;
  if (!visible.some((payment) => payment.id === state.selected[state.status])) state.selected[state.status] = visible[0]?.id;
  $('queue-title').textContent = state.status === 'pending' ? 'Payment queue' : `${statuses[state.status]}`;
  $('queue-count').textContent = `${visible.length} ${state.status === 'pending' ? 'waiting' : 'reports'}`;
  $('payment-list').innerHTML = visible.length ? (state.concept.key === 'grouped'
    ? ['mtn', 'airtel'].map((network) => {
      const group = visible.filter((payment) => payment.network === network);
      return group.length ? `<h3 class="group-heading">${networkMark(network)}${networkName(network)}<span>${group.length}</span></h3>${group.map(paymentRow).join('')}` : '';
    }).join('') : visible.map(paymentRow).join(''))
    : `<div class="empty-state"><strong>No matching payments</strong><p>Try another phone number, payment ID, or package.</p><button type="button" class="secondary-button" data-action="clear-search">Clear filters</button></div>`;
  renderDetails(visible.find((payment) => payment.id === state.selected[state.status]));
  if (previous !== state.selected[state.status]) $('detail-scroll').scrollTop = 0;
}

const sectionHeading = (eyebrow, title, mark = '') => `<div class="section-heading">${mark ? icon(mark) : ''}<div><span class="section-kicker">${eyebrow}</span><h3>${title}</h3></div></div>`;
const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

function heading(payment) {
  return `<header class="review-heading"><div><p class="review-kicker">PAYMENT REPORT <span class="status-badge" data-status="${payment.status}">${statusLabel(payment.status)}</span></p>
    <h2>${payment.id}</h2><p class="detail-phone">${payment.phone}<span class="detail-subscriber">${payment.account}</span></p></div>
    <div class="review-heading-end">${networkMark(payment.network)}<span>${networkName(payment.network)}</span><button type="button" class="copy-button" data-copy="${payment.id}" aria-label="Copy payment reference">${icon('copy')}</button></div></header>`;
}
function amount(payment) {
  return `<section class="amount-banner" aria-label="Payment summary"><div><span class="section-kicker">${payment.status === 'approved' ? 'Amount received' : 'Amount reported'}</span><strong>${money(payment.amount)}</strong></div>
    <div class="amount-package"><span>${payment.plan}</span><small>${payment.duration} of access</small></div><span class="amount-caption">Submitted ${dateLabel(payment.timestamp)}</span></section>`;
}
function facts(payment, title = 'Payment information') {
  return `<section class="facts-section">${sectionHeading('THE DETAILS', title)}<dl class="facts">${fact('Payment ID', `<span class="mono">${payment.id}</span>`)}${fact('Sending number', payment.phone)}${fact('Provider', `<span class="inline-provider">${networkMark(payment.network)}${networkName(payment.network)}</span>`)}${fact('Package', `${payment.plan} · ${payment.duration}`)}${fact('Package price', money(payment.expected))}${fact('Account credit', money(payment.credit))}${fact('Submitted', dateLabel(payment.timestamp))}</dl></section>`;
}
function proof(payment, title = 'Payment evidence') {
  return `<section class="proof-section">${sectionHeading('SUBMITTED RECEIPT', title)}<div class="proof-document" data-network="${payment.network}"><div class="proof-document-head">${networkMark(payment.network)}<span>FICTIONAL SAMPLE</span></div>
    <p class="receipt-intro">${networkName(payment.network)} payment report</p><p class="receipt-total">${money(payment.amount)}</p><p class="receipt-confirmation">Reported transfer to Goal Hint</p><dl>${fact('Reference', payment.transaction)}${fact('From', payment.phone)}${fact('Date & time', dateLabel(payment.timestamp))}${fact('Purpose', `${payment.plan} package`)}</dl><div class="receipt-watermark">SAMPLE · NOT A TRANSACTION</div></div>
    <p class="section-note">Illustrative receipt. The selected design will show the subscriber’s actual uploaded proof.</p></section>`;
}
function checks(payment) {
  const entries = [
    { title: payment.warning ? 'Amount needs a closer look' : 'Amount matches the package', detail: payment.warning ? `${money(payment.amount - payment.expected)} above the package price.` : `${money(payment.expected)} expected for ${payment.plan.toLowerCase()} access.`, warning: payment.warning },
    { title: 'Subscriber account found', detail: `Sending number matches ${payment.account.toLowerCase()}.` },
    { title: 'No duplicate reference', detail: 'This sample reference is unique in the demo queue.' },
    { title: 'Receipt attached', detail: 'Payment evidence is ready for review.' },
  ];
  return `<section class="checks-section">${sectionHeading('REVIEW ASSISTANCE', 'Verification checks', 'shield')}<ul class="check-list">${entries.map((entry) => `<li${entry.warning ? ' class="check-warning"' : ''}><span class="check-icon">${icon(entry.warning ? 'alert' : 'check')}</span><div><strong>${entry.title}</strong><p>${entry.detail}</p></div></li>`).join('')}</ul><p class="section-note">Sample checks for layout comparison. Always verify the received payment.</p></section>`;
}
function decision(payment) {
  const edits = state.edits.get(payment.id) || { amount: String(payment.amount), transaction: payment.transaction, note: '' };
  if (payment.status !== 'pending') return `<section class="decision-section">${sectionHeading('REVIEW OUTCOME', statusLabel(payment.status), payment.status === 'approved' ? 'check' : payment.status === 'rejected' ? 'close' : 'arrow')}<div class="decision-summary"><p>${payment.status === 'approved'
    ? `${money(payment.amount)} was marked as received in this sample. ${payment.plan} access is shown as active.`
    : payment.status === 'rejected' ? 'This sample report was rejected because the transfer could not be verified.' : 'A newer sample report replaced this submission. The earlier report remains available for context.'}</p><dl class="facts">${fact('Reviewed by', 'Demo administrator')}${fact('Reference', `<span class="mono">${payment.transaction}</span>`)}</dl></div></section>`;
  return `<section class="decision-section">${sectionHeading('YOUR DECISION', 'Confirm received payment')}<form id="demo-review-form" data-payment-form="${payment.id}"><div class="field-grid"><label class="review-field">Transaction ID<input name="transaction" value="${escape(edits.transaction)}" maxlength="40" autocomplete="off" spellcheck="false"></label><label class="review-field">Amount received · UGX<input name="amount" type="number" min="0" step="1" value="${escape(edits.amount)}"></label></div>
    <label class="review-field">Review note <span class="optional-label">optional</span><textarea name="note" rows="2" maxlength="200" placeholder="Add context for this payment">${escape(edits.note)}</textarea></label><p class="section-note">These fields are editable for preview. No changes are sent or saved to an account.</p></form></section>`;
}
function activity(payment) {
  return `<section class="activity-section">${sectionHeading('PAYMENT HISTORY', 'Activity trail', 'clock')}<ol class="activity-list"><li><span class="activity-dot"></span><div><strong>Report submitted</strong><p>${payment.account} reported ${money(payment.amount)} via ${networkName(payment.network)}.</p><time>${dateLabel(payment.timestamp)}</time></div></li><li><span class="activity-dot"></span><div><strong>Evidence attached</strong><p>A receipt and sending number were added to the report.</p><time>${dateLabel(payment.timestamp)}</time></div></li><li><span class="activity-dot${payment.status === 'pending' ? ' is-pending' : ''}"></span><div><strong>${payment.status === 'pending' ? 'Waiting for your review' : statusLabel(payment.status)}</strong><p>${payment.status === 'pending' ? 'Confirm the received transfer before approving access.' : 'The sample decision is recorded in this demonstration.'}</p><span class="activity-current">${payment.status === 'pending' ? 'Current step' : 'Sample outcome'}</span></div></li></ol></section>`;
}
function comparison(payment) {
  return `<section class="comparison-section">${sectionHeading('RECONCILIATION', 'Reported and expected')}<div class="comparison-grid"><article class="comparison-card"><span class="section-kicker">SUBSCRIBER REPORTED</span><strong>${money(payment.amount)}</strong><dl class="facts">${fact('Provider', networkName(payment.network))}${fact('Sending number', payment.phone)}${fact('Reference', `<span class="mono">${payment.transaction}</span>`)}</dl></article><article class="comparison-card is-expected"><span class="section-kicker">PACKAGE EXPECTS</span><strong>${money(payment.expected)}</strong><dl class="facts">${fact('Package', payment.plan)}${fact('Access', payment.duration)}${fact('Difference', payment.amount === payment.expected ? 'Exact match' : `${money(payment.amount - payment.expected)} above price`)}</dl></article></div></section>`;
}
function verdict(payment) {
  return `<div class="verdict-strip${payment.warning ? ' verdict-strip--warning' : ''}">${icon(payment.warning ? 'alert' : 'shield')}<span><strong>${payment.warning ? 'Check the amount before approving' : 'Ready for a manual review'}</strong><small>${payment.warning ? 'The reported amount is above the package price.' : 'Subscriber, reference, package, and evidence are together.'}</small></span><span class="verdict-count">${payment.warning ? '1 needs attention' : '4 sample checks'}</span></div>`;
}

function renderDetails(payment) {
  const content = $('detail-content');
  content.dataset.layout = state.concept.key;
  content.className = 'detail-layout';
  content.dataset.payment = payment?.id ?? '';
  if (!payment) {
    content.innerHTML = '<div class="empty-state detail-empty"><strong>No payment selected</strong><p>Choose another filter to find a payment.</p></div>';
    $('review-footer').innerHTML = '<span class="footer-preview-note">Sample data · Preview only</span>';
    return;
  }
  const sections = { facts: facts(payment), proof: proof(payment), checks: checks(payment), decision: decision(payment), activity: activity(payment), comparison: comparison(payment) };
  const column = (name, keys) => `<div class="detail-${name}">${keys.map((key) => sections[key]).join('')}</div>`;
  const layouts = {
    inbox: `${amount(payment)}<div class="detail-grid">${column('primary', ['facts', 'checks', 'decision'])}${column('secondary', ['proof', 'activity'])}</div>`,
    compact: `${verdict(payment)}${amount(payment)}<div class="detail-grid">${column('primary', ['decision', 'facts'])}${column('secondary', ['checks', 'proof', 'activity'])}</div>`,
    ledger: `${amount(payment)}${comparison(payment)}<div class="detail-grid">${column('primary', ['facts', 'decision'])}${column('secondary', ['checks', 'proof', 'activity'])}</div>`,
    receipt: `<div class="detail-grid">${column('primary', ['proof', 'activity'])}<div class="detail-secondary">${amount(payment)}${sections.facts}${sections.checks}${sections.decision}</div></div>`,
    compare: `${comparison(payment)}${verdict(payment)}<div class="detail-grid">${column('primary', ['proof', 'facts'])}${column('secondary', ['decision', 'checks', 'activity'])}</div>`,
    timeline: `${amount(payment)}<div class="detail-grid"><div class="detail-primary activity-primary">${sections.activity}${sections.proof}</div>${column('secondary', ['facts', 'checks', 'decision'])}</div>`,
    workspace: `${amount(payment)}${verdict(payment)}<div class="detail-grid">${column('primary', ['facts', 'checks'])}${column('secondary', ['proof', 'activity'])}${column('decision-column', ['decision'])}</div>`,
    contrast: `${amount(payment)}<div class="detail-grid">${column('primary', ['proof', 'checks'])}${column('secondary', ['facts', 'decision', 'activity'])}</div>`,
    grouped: `<div class="subscriber-banner"><span class="subscriber-monogram">DS</span><div><span class="section-kicker">SUBSCRIBER</span><strong>${payment.phone}</strong><small>${payment.account} · ${payment.plan} package</small></div><span class="subscriber-credit"><small>Current credit</small><strong>${money(payment.credit)}</strong></span></div>${amount(payment)}<div class="detail-grid">${column('primary', ['decision', 'checks', 'activity'])}${column('secondary', ['proof', 'facts'])}</div>`,
    focus: `${amount(payment)}<div class="detail-grid">${column('primary', ['decision', 'checks'])}${column('secondary', ['proof', 'facts', 'activity'])}</div>`,
  };
  content.innerHTML = `${heading(payment)}${layouts[state.concept.key]}`;
  $('review-footer').innerHTML = `<div class="footer-selection"><strong>${payment.id}</strong><span>${payment.plan} · ${money(payment.amount)}</span></div><span class="footer-preview-note">Preview only</span><div class="footer-actions">${payment.status === 'pending'
    ? `<button type="button" class="danger-button" data-action="reject">${icon('close')}Reject</button><button type="submit" form="demo-review-form" class="primary-button">${icon('check')}Approve payment</button>`
    : `<button type="button" class="secondary-button" data-action="outcome">${icon('clock')}Review outcome</button>`}</div>`;
}

function miniature(concept) {
  return `<div class="mini-layout mini-layout--${concept.key}" aria-hidden="true"><div class="mini-nav"><i></i><i></i><i></i><i></i><i></i></div><div class="mini-queue">${Array.from({ length: 4 }, (_, index) => `<div${index === 0 ? ' class="is-active"' : ''}><b></b><span><i></i><i></i></span></div>`).join('')}</div><div class="mini-detail"><div class="mini-amount"></div><div class="mini-columns"><div class="mini-lines"><i></i><i></i><i></i><i></i></div><div class="mini-proof"></div></div><div class="mini-action"></div></div></div>`;
}
function renderGallery() {
  $('gallery-grid').innerHTML = concepts.map((concept) => `<button type="button" class="design-card${concept.id === state.concept.id ? ' is-selected' : ''}" data-design="${concept.id}" aria-pressed="${concept.id === state.concept.id}" aria-label="Preview layout ${concept.id}: ${concept.name}"><div class="design-card-top"><span class="design-number">${concept.id}</span><span>${concept.tag}</span>${state.shortlist.has(concept.id) ? `<span class="shortlisted-mark">${icon('star')}</span>` : ''}</div>${miniature(concept)}<div class="design-card-copy"><h3>${concept.name}</h3><p>${concept.description}</p><span class="design-open">Preview layout ${icon('arrow')}</span></div></button>`).join('');
}
function updateShortlist() {
  const saved = state.shortlist.has(state.concept.id);
  $('shortlist').setAttribute('aria-pressed', String(saved));
  $('shortlist').innerHTML = `${icon('star')}<span>${saved ? 'Shortlisted' : 'Shortlist'}</span>`;
  $('shortlist-note').textContent = `${state.shortlist.size} shortlisted`;
}
function renderConcept() {
  const concept = state.concept;
  $('app').dataset.layout = concept.key;
  $('design-title').textContent = `${concept.id} / ${concept.name}`;
  $('design-description').textContent = concept.description;
  $('design-strip').innerHTML = concepts.map((item) => `<button type="button" data-design="${item.id}" aria-label="Preview layout ${item.id}: ${item.name}" aria-pressed="${item.id === concept.id}" title="${item.name}"><span>${item.id}</span><span>${item.name}</span></button>`).join('');
  document.title = `${concept.id} ${concept.name} · Payments layouts · Goal Hint`;
  updateShortlist(); renderGallery(); renderList();
}
function selectConcept(id, updateHash = true) {
  const concept = concepts.find((item) => item.id === id);
  if (!concept) return;
  state.concept = concept;
  if (updateHash && window.location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  renderConcept();
  $('detail-scroll').scrollTop = 0;
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').textContent = theme === 'dark' ? '☀' : '◐';
  $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  $('theme-toggle').title = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
  storage.set('goal-hint.admin-payment-layouts.theme.v1', theme);
}

document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const design = target?.closest('[data-design]');
  if (design) {
    const fromGallery = !!design.closest('#gallery');
    selectConcept(design.dataset.design);
    if ($('gallery').open) $('gallery').close();
    (fromGallery ? $('open-gallery') : $('design-strip').querySelector(`[data-design="${state.concept.id}"]`))?.focus({ preventScroll: true });
    return;
  }
  const row = target?.closest('[data-payment]');
  if (row) {
    state.selected[state.status] = row.dataset.payment;
    const top = $('list-scroll').scrollTop;
    renderList(); $('list-scroll').scrollTop = top; $('detail-scroll').scrollTop = 0;
    $('payment-list').querySelector(`[data-payment="${row.dataset.payment}"]`)?.focus({ preventScroll: true });
    return;
  }
  const status = target?.closest('[data-status-tab]');
  if (status) {
    state.status = status.dataset.statusTab;
    renderTabs(); renderList(); $('list-scroll').scrollTop = 0; $('detail-scroll').scrollTop = 0;
    $('status-tabs').querySelector(`[data-status-tab="${state.status}"]`)?.focus({ preventScroll: true });
    return;
  }
  const copy = target?.closest('[data-copy]');
  if (copy) {
    try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Payment reference copied.'); }
    catch { toast(`Payment reference: ${copy.dataset.copy}`); }
    return;
  }
  const action = target?.closest('[data-action]')?.dataset.action;
  if (action === 'clear-search') {
    state.search = ''; state.provider = 'all'; $('search').value = ''; $('provider-filter').value = 'all'; renderList(); $('search').focus();
  } else if (action === 'reject') toast('Preview only: rejection demonstrated. No payment or account was changed.');
  else if (action === 'outcome') toast('This is a sample review outcome. No live payment data is loaded.');
  if (target?.closest('[data-preview-nav]')) {
    event.preventDefault(); toast('You are previewing the Payments page. Other dashboard sections are shown for context.');
  }
});
document.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (target.id === 'search') { state.search = target.value; renderList(); return; }
  const form = target.closest('[data-payment-form]');
  if (form) state.edits.set(form.dataset.paymentForm, Object.fromEntries(new FormData(form)));
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('[data-payment-form]')) return;
  event.preventDefault();
  const values = new FormData(form);
  if (!String(values.get('transaction')).trim() || !/^\d+$/.test(String(values.get('amount')))) { toast('Enter a transaction ID and a valid whole-number amount to try the approval.'); return; }
  toast('Preview only: approval demonstrated. No payment, access, or account was changed.');
});
$('provider-filter').addEventListener('change', (event) => { state.provider = event.target.value; renderList(); $('list-scroll').scrollTop = 0; });
$('sort-order').addEventListener('change', (event) => { state.sort = event.target.value; renderList(); $('list-scroll').scrollTop = 0; });
$('open-gallery').addEventListener('click', () => $('gallery').showModal());
$('close-gallery').addEventListener('click', () => $('gallery').close());
$('gallery').addEventListener('click', (event) => { if (event.target === $('gallery')) $('gallery').close(); });
$('previous-design').addEventListener('click', () => selectConcept(concepts[(concepts.indexOf(state.concept) + concepts.length - 1) % concepts.length].id));
$('next-design').addEventListener('click', () => selectConcept(concepts[(concepts.indexOf(state.concept) + 1) % concepts.length].id));
$('shortlist').addEventListener('click', () => {
  const id = state.concept.id;
  if (state.shortlist.has(id)) state.shortlist.delete(id); else state.shortlist.add(id);
  storage.set('goal-hint.admin-payment-layouts.shortlist.v1', [...state.shortlist]);
  updateShortlist(); renderGallery(); toast(state.shortlist.has(id) ? `${id} ${state.concept.name} added to your shortlist.` : `${id} removed from your shortlist.`);
});
$('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('refresh-queue')?.addEventListener('click', () => toast('The sample queue is up to date. No live payment data is requested.'));
window.addEventListener('hashchange', () => selectConcept(window.location.hash.slice(1), false));

state.provider = $('provider-filter').value;
state.sort = $('sort-order').value;
setTheme(storage.get('goal-hint.admin-payment-layouts.theme.v1', 'light') === 'dark' ? 'dark' : 'light');
renderTabs();
selectConcept(concepts.some((concept) => concept.id === window.location.hash.slice(1)) ? window.location.hash.slice(1) : '01');

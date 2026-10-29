import { concepts } from './catalog.js';

const $ = (id) => document.getElementById(id);
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const moneyFormatter = new Intl.NumberFormat('en-UG');
const money = (amount) => `UGX ${moneyFormatter.format(amount)}`;
const statuses = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', replaced: 'Replaced reports' };
const statusLabel = (status) => status === 'replaced' ? 'Replaced report' : statuses[status];
const networkName = (network) => network === 'mtn' ? 'MTN MoMo' : 'Airtel Money';
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Preferences are optional. */ } },
};
const savedShortlist = storage.get('goal-hint.admin-payment-layouts.shortlist.v1', []);
const state = {
  concept: concepts[0], status: 'pending', search: '', provider: 'all', sort: 'newest', selected: {}, edits: new Map(),
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
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  message: '<path d="M3 4h18v13H8l-5 4V4Z"/><path d="M7 8h10M7 12h7"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true">${iconPaths[name] || iconPaths.check}</svg>`;
export function networkMark(network) {
  return `<span class="network-mark network-mark--${network}" role="img" aria-label="${networkName(network)}">${network === 'mtn'
    ? '<span class="mtn-crop"><img src="../payment-networks/mtn-momo.jpg" alt="" width="557" height="359"></span>'
    : '<img src="../payment-networks/airtel-money.svg" alt="" width="55" height="57">'}</span>`;
}
const packages = [
  { name: 'Weekly', duration: '7 days', amount: 5000 }, { name: 'Monthly', duration: '30 days', amount: 20000 },
  { name: 'Daily', duration: '1 day', amount: 1000 }, { name: 'Quarterly', duration: '90 days', amount: 50000 },
  { name: 'Credit top-up', duration: 'Account credit', amount: null },
];
const dateFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dateLabel = (value) => dateFormatter.format(new Date(value)).replace(',', ' ·') + ' EAT';
const payments = Object.keys(statuses).flatMap((status, statusIndex) => Array.from({ length: 20 }, (_, index) => {
  const plan = packages[index % 9 === 8 ? 4 : index % 4], sequence = statusIndex * 100 + index + 1;
  const network = index % 3 === 1 ? 'airtel' : 'mtn';
  const phone = `+256 ${network === 'mtn' ? '770' : '750'} 000 ${String(100 + sequence).padStart(3, '0')}`;
  return {
    id: `GH-${26000 + sequence}`, status, network, phone, payerPhone: index % 6 === 4 ? '+256 750 000 900' : phone,
    transaction: `${network === 'mtn' ? 'MTN' : 'AM'}-DEMO-${String(sequence).padStart(6, '0')}`,
    plan: plan.name, duration: plan.duration, amount: (plan.amount ?? 10000) + (status === 'pending' && index % 7 === 4 ? 1000 : 0),
    timestamp: new Date(Date.UTC(2026, 9, 29, 9, 42) - index * 37 * 60000 - statusIndex * 86400000).toISOString(),
    account: `Demo subscriber ${String(sequence).padStart(2, '0')}`, credit: index % 4 === 2 ? 2000 : 0,
    hasProof: index % 8 !== 7, note: '', reason: status === 'rejected' ? 'Payment not received' : '',
  };
}));
const selectedPayment = () => payments.find((payment) => payment.id === state.selected[state.status]);
const valuesFor = (payment) => state.edits.get(payment.id) ?? { amount: String(payment.amount), transaction: payment.transaction, network: payment.network, plan: payment.plan, note: payment.note };
const selectedPlan = (values) => packages.find((plan) => plan.name === values.plan) ?? packages[0];
const validAmount = (value) => /^\d+$/u.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) <= 4294967295;
const validTransaction = (value) => /^[A-Z0-9.\-]{4,40}$/u.test(value);
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function visiblePayments() {
  const query = state.search.toLowerCase().replace(/[\s()+.-]/g, '');
  return payments.filter((payment) => payment.status === state.status && (state.provider === 'all' || payment.network === state.provider)
    && (!query || [payment.id, payment.phone, payment.plan, payment.transaction, networkName(payment.network)].join(' ').toLowerCase().replace(/[\s()+.-]/g, '').includes(query)))
    .sort((a, b) => state.sort === 'amount' ? b.amount - a.amount || b.timestamp.localeCompare(a.timestamp)
      : state.sort === 'oldest' ? a.timestamp.localeCompare(b.timestamp) : b.timestamp.localeCompare(a.timestamp));
}
function warningFor(payment, values = valuesFor(payment)) {
  const plan = selectedPlan(values);
  return !validAmount(values.amount) || !validTransaction(values.transaction) || (plan.amount !== null && Number(values.amount) !== plan.amount) || payment.payerPhone !== payment.phone || !payment.hasProof;
}
function paymentRow(payment) {
  return `<button type="button" class="payment-row" aria-current="${state.selected[state.status] === payment.id}" aria-controls="detail-content" data-payment="${payment.id}">
    ${networkMark(payment.network)}<span class="payment-main"><span class="payment-ref">${payment.id}</span><span class="payment-phone">${payment.phone}</span><span class="payment-time">${dateLabel(payment.timestamp)}</span></span>
    <span class="payment-side"><strong class="payment-amount">${money(payment.amount)}</strong><span class="payment-plan">${payment.plan}</span><span class="row-indicator${warningFor(payment) ? ' has-warning' : ''}">${warningFor(payment) ? `${icon('alert')}Check details` : statusLabel(payment.status)}</span></span></button>`;
}
function renderTabs() {
  $('status-tabs').innerHTML = Object.entries(statuses).map(([status, label]) => `<button type="button" data-status-tab="${status}" aria-current="${state.status === status ? 'page' : 'false'}">${label}<span class="tab-count">${payments.filter((payment) => payment.status === status).length}</span></button>`).join('');
  document.querySelector('.nav-count').textContent = payments.filter((payment) => payment.status === 'pending').length;
}
function renderNavigation(visible) {
  const index = visible.findIndex((payment) => payment.id === state.selected[state.status]);
  $('payment-navigator').setAttribute('aria-label', visible.length ? `Payment ${index + 1} of ${visible.length}` : 'No payment selected');
  $('payment-position').textContent = visible.length ? `${index + 1} of ${visible.length}` : '0 of 0';
  $('previous-payment').disabled = index <= 0; $('next-payment').disabled = index < 0 || index >= visible.length - 1;
}
function renderList() {
  const visible = visiblePayments(), previous = $('detail-content').dataset.payment;
  if (!visible.some((payment) => payment.id === state.selected[state.status])) state.selected[state.status] = visible[0]?.id;
  $('queue-title').textContent = state.status === 'pending' ? 'Payment queue' : statuses[state.status];
  $('queue-count').textContent = `${visible.length} ${state.status === 'pending' ? 'waiting' : 'reports'}`;
  $('payment-list').innerHTML = visible.length ? visible.map(paymentRow).join('') : '<div class="empty-state"><strong>No matching payments</strong><p>Try another phone, reference, or package.</p><button type="button" class="secondary-button" data-action="clear-search">Clear filters</button></div>';
  renderNavigation(visible); renderDetails(selectedPayment());
  if (previous !== state.selected[state.status]) $('detail-scroll').scrollTop = 0;
}
const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
const sectionHeading = (number, title, end = '') => `<header class="section-heading"><h3><span class="step-number">${number}</span>${title}</h3>${end}</header>`;
function heading(payment) {
  return `<header class="review-heading">${networkMark(valuesFor(payment).network)}<div class="review-identity"><div class="reference-line"><h2 tabindex="-1" id="selected-reference">${payment.id}</h2><button type="button" class="copy-button" data-copy="${payment.id}" aria-label="Copy payment reference">${icon('copy')}</button><span class="status-badge" data-status="${payment.status}">${statusLabel(payment.status)}</span></div><p>Submitted ${dateLabel(payment.timestamp)}</p></div><span class="review-label">Payment review</span></header>`;
}
function account(payment) {
  return `<section class="review-section account-section" data-section="account">${sectionHeading('01', 'Subscriber & account')}<dl class="facts">${fact('Subscriber', `${escape(payment.account)}<small>${payment.phone}</small>`)}${fact('Sending number', payment.payerPhone === payment.phone ? '<span class="muted">Same as subscriber</span>' : payment.payerPhone)}${fact('Current credit', payment.credit === 0 ? 'No credit balance' : money(payment.credit))}</dl><button type="button" class="text-button" data-action="subscriber">View subscriber ${icon('arrow')}</button>
    ${payment.status !== 'pending' ? `<div class="outcome-note"><strong>${payment.status === 'approved' ? payment.plan === 'Credit top-up' ? 'Credit added' : 'Access granted' : payment.status === 'rejected' ? 'No access granted' : 'A newer report is available'}</strong><p>${payment.status === 'rejected' ? escape(payment.reason) : payment.status === 'approved' ? 'Reviewed by Demo administrator.' : 'This earlier submission is kept for context.'}</p>${payment.note ? `<p>Review note: ${escape(payment.note)}</p>` : ''}</div>` : ''}</section>`;
}
function transferEffects(payment) {
  const values = valuesFor(payment), plan = selectedPlan(values);
  if (!validAmount(values.amount)) return '<p class="field-warning">Enter a whole-number amount from 0 to 4,294,967,295.</p>';
  if (plan.amount === null) return '<p class="field-note">The received amount becomes account credit.</p>';
  const difference = Number(values.amount) - plan.amount;
  return `<p class="field-note">${plan.duration} of access${difference === 0 ? ' · Amount matches package price.' : ` · Package price: <strong>${money(plan.amount)}</strong>.`}</p>${difference > 0 ? `<p class="field-note credit-note">${money(difference)} above the price becomes account credit.</p>` : difference < 0 ? '<p class="field-warning">The received amount is below the package price. Verify before approving.</p>' : ''}`;
}
function transfer(payment) {
  const values = valuesFor(payment), pending = payment.status === 'pending';
  const field = (label, content, modifier = '') => `<label class="review-field ${modifier}"><span>${label}</span>${content}</label>`;
  return `<section class="review-section transfer-section" data-section="transfer">${sectionHeading('02', pending ? 'Confirm received payment' : 'Recorded payment', pending ? `<button type="button" class="text-button sms-trigger" data-action="sms">${icon('message')}Paste wallet SMS</button>` : '<span class="readonly-label">Read only</span>')}
    <form id="demo-review-form" data-payment-form="${payment.id}"><div class="field-grid">
      ${field(`${pending || payment.status === 'approved' ? 'Amount received' : 'Amount reported'} · UGX`, `<input name="amount" aria-label="${pending || payment.status === 'approved' ? 'Amount received' : 'Amount reported'} in UGX" type="number" min="0" max="4294967295" step="1" required value="${escape(values.amount)}" ${pending ? '' : 'readonly'}>`, 'amount-field')}
      ${field('Transaction ID', `<input name="transaction" required pattern="[A-Z0-9.\\-]{4,40}" value="${escape(values.transaction)}" maxlength="40" autocomplete="off" spellcheck="false" ${pending ? '' : 'readonly'}>`, 'transaction-field')}
      ${field('Payment provider', `<select name="network" ${pending ? '' : 'disabled'}><option value="mtn"${values.network === 'mtn' ? ' selected' : ''}>MTN MoMo</option><option value="airtel"${values.network === 'airtel' ? ' selected' : ''}>Airtel Money</option></select>`, 'provider-field')}
      ${field('Package / purpose', `<select name="plan" ${pending ? '' : 'disabled'}>${packages.map((plan) => `<option${values.plan === plan.name ? ' selected' : ''}>${plan.name}</option>`).join('')}</select>`, 'plan-field')}
    </div><div class="transfer-effects" aria-live="polite">${transferEffects(payment)}</div>${pending ? `${field('Review note <small>optional</small>', `<textarea name="note" rows="2" maxlength="200" placeholder="Add context for the decision">${escape(values.note)}</textarea>`, 'note-field')}<p class="edit-caption">Edit any field above before approving.</p>` : ''}</form></section>`;
}
function proof(payment, expanded = false) {
  return `<section class="review-section proof-section" data-section="proof">${sectionHeading('03', 'Payment evidence', payment.hasProof && !expanded ? '<button type="button" class="text-button" data-action="proof">Enlarge ↗</button>' : '')}
    <div class="proof-stage${payment.hasProof ? '' : ' proof-stage--missing'}">${payment.hasProof ? `<div class="proof-paper"><div class="proof-paper-heading">${icon('receipt')}<span>UPLOADED RECEIPT</span></div><div class="receipt-rule receipt-rule--strong"></div><div class="receipt-rule"></div><div class="receipt-rule receipt-rule--short"></div><div class="receipt-placeholder"><span>Payment screenshot</span><small>Illustrative evidence preview</small></div><div class="receipt-rule"></div><div class="receipt-rule receipt-rule--short"></div><div class="proof-watermark">FICTIONAL SAMPLE</div></div>` : `${icon('receipt')}<strong>No screenshot attached</strong><p>Verify the transfer in the receiving wallet.</p>`}</div>
    <p class="section-note">${payment.hasProof ? 'The live screen will show the original uploaded image here. Confirm its details against the editable fields.' : 'An attachment is supporting evidence. Confirm receipt of funds before making a decision.'}</p></section>`;
}
function checkItems(payment) {
  const values = valuesFor(payment), plan = selectedPlan(values), amountValid = validAmount(values.amount);
  const entries = [
    { good: amountValid && (plan.amount === null || Number(values.amount) === plan.amount), title: !amountValid ? 'Received amount needs correction' : plan.amount === null ? 'Credit top-up selected' : Number(values.amount) === plan.amount ? 'Amount matches selected package' : 'Amount differs from package price' },
    { good: validTransaction(values.transaction), title: validTransaction(values.transaction) ? 'Transaction ID format is valid' : 'Transaction ID needs correction' },
    { good: payment.payerPhone === payment.phone, title: payment.payerPhone === payment.phone ? 'Sending number matches subscriber' : 'Different sending number — verify payer' },
    { good: payment.hasProof, title: payment.hasProof ? 'Evidence attached for inspection' : 'No screenshot — verify in wallet' },
  ];
  return entries.map((entry) => `<li class="${entry.good ? 'check-good' : 'check-warning'}">${icon(entry.good ? 'check' : 'alert')}<span>${entry.title}</span></li>`).join('');
}
function checks(payment) {
  return `<section class="review-section checks-section" data-section="checks">${sectionHeading('04', 'Verification checks', icon('shield'))}<ul class="check-list">${checkItems(payment)}</ul><p class="section-note">Checks assist your review. Confirm funds in the receiving wallet.</p></section>`;
}
function renderDetails(payment) {
  const content = $('detail-content'); content.dataset.layout = state.concept.key; content.dataset.payment = payment?.id ?? '';
  if (!payment) { content.innerHTML = '<div class="empty-state detail-empty"><strong>No payment selected</strong><p>Choose another status or clear the filters.</p></div>'; $('review-footer').innerHTML = '<span class="footer-preview-note">Sample workspace</span>'; return; }
  const sections = { transfer: transfer(payment), account: account(payment), proof: proof(payment), checks: checks(payment) };
  const ordered = [...new Set(state.concept.areas.flatMap((row) => row.split(' ')))];
  content.innerHTML = `${heading(payment)}<div class="review-grid">${ordered.map((key) => sections[key]).join('')}</div>`;
  $('review-footer').innerHTML = `<span class="footer-preview-note">${payment.status === 'pending' ? 'Confirm funds before approving' : 'Sample decision recorded'}</span><div class="footer-actions">${payment.status === 'pending' ? `<button type="button" class="danger-button" data-action="reject">${icon('close')}Reject</button><button type="submit" form="demo-review-form" class="primary-button" data-approve>${icon('check')}Approve payment</button>` : '<span class="resolved-label">Preview only · No account changes</span>'}</div>`;
  updateTransfer(payment);
}
function updateTransfer(payment) {
  document.querySelector('.transfer-effects').innerHTML = transferEffects(payment); document.querySelector('.check-list').innerHTML = checkItems(payment);
  const values = valuesFor(payment), approve = document.querySelector('[data-approve]');
  if (approve) { approve.disabled = !validAmount(values.amount) || !validTransaction(values.transaction); approve.innerHTML = `${icon('check')}${values.plan === 'Credit top-up' ? 'Approve top-up' : 'Approve payment'}`; }
}
function miniature(concept) {
  const unique = [...new Set(concept.areas.flatMap((row) => row.split(' ')))];
  return `<div class="mini-layout" aria-hidden="true"><div class="mini-queue">${'<i></i>'.repeat(5)}</div><div class="mini-detail mini-detail--${concept.key}" style="grid-template-areas:${concept.areas.map((row) => `'${row}'`).join(' ')}">${unique.map((section) => `<span class="mini-block mini-${section}" style="grid-area:${section}"></span>`).join('')}</div></div>`;
}
function renderGallery() {
  $('gallery-grid').innerHTML = concepts.map((concept) => `<button type="button" class="design-card${concept.id === state.concept.id ? ' is-selected' : ''}" data-design="${concept.id}" aria-pressed="${concept.id === state.concept.id}"><div class="design-card-top"><span>${concept.id}</span><span>${concept.tag}</span>${state.shortlist.has(concept.id) ? icon('star') : ''}</div>${miniature(concept)}<div class="design-card-copy"><h3>${concept.name}</h3><p>${concept.description}</p><span class="design-open">Explore layout ${icon('arrow')}</span></div></button>`).join('');
}
function updateShortlist() {
  const saved = state.shortlist.has(state.concept.id); $('shortlist').setAttribute('aria-pressed', String(saved)); $('shortlist').innerHTML = `${icon('star')}<span>${saved ? 'Shortlisted' : 'Shortlist'}</span>`;
  $('shortlist-note').textContent = state.shortlist.size ? `${[...state.shortlist].sort().join(', ')} shortlisted` : 'Shortlist your favorites, then choose a layout number.';
}
function selectConcept(id, updateHash = true) {
  const concept = concepts.find((item) => item.id === id); if (!concept) return;
  state.concept = concept; if (updateHash && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  $('app').dataset.layout = concept.key; $('design-title').textContent = `${concept.id} / ${concept.name}`; $('design-description').textContent = concept.description;
  $('design-strip').innerHTML = concepts.map((item) => `<button type="button" data-design="${item.id}" aria-label="Preview layout ${item.id}: ${item.name}" aria-pressed="${item.id === concept.id}" title="${item.name}"><span>${item.id}</span><span>${item.name}</span></button>`).join('');
  document.title = `${concept.id} ${concept.name} · Payments layouts · Goal Hint`; updateShortlist(); renderGallery(); renderList(); $('detail-scroll').scrollTop = 0;
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme; $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark')); $('theme-toggle').textContent = theme === 'dark' ? '☀' : '◐'; $('theme-toggle').setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`); storage.set('goal-hint.admin-payment-layouts.theme.v1', theme);
}
function stepPayment(direction) {
  const visible = visiblePayments(), index = visible.findIndex((payment) => payment.id === state.selected[state.status]), next = visible[index + direction];
  if (!next) return;
  const initiatingButton = direction > 0 ? $('next-payment') : $('previous-payment');
  state.selected[state.status] = next.id; renderList(); document.querySelector(`.payment-row[data-payment="${next.id}"]`)?.scrollIntoView({ block: 'nearest' });
  (initiatingButton.disabled ? document.querySelector('.payment-navigator button:not(:disabled)') ?? $('selected-reference') : initiatingButton)?.focus({ preventScroll: true });
}
function resolvePayment(payment, status, values, reason = '') {
  const current = visiblePayments(), index = current.indexOf(payment);
  Object.assign(payment, { status, ...values, amount: Number(values.amount), reason }); state.edits.delete(payment.id); state.selected[state.status] = current[index + 1]?.id ?? current[index - 1]?.id;
  renderTabs(); renderList(); toast(`${payment.id} ${status} in the sample queue. No live payment or account was changed.`); $('selected-reference')?.focus({ preventScroll: true });
}
function openAction(action) {
  const payment = selectedPayment(); if (!payment) return;
  const dialog = $('action-dialog'); dialog.dataset.action = action; dialog.dataset.payment = payment.id;
  if (action === 'reject') dialog.innerHTML = `<form id="reject-sample-form"><header class="dialog-head"><h2>Reject sample payment</h2><button type="button" class="square-button" data-close-dialog aria-label="Close rejection">×</button></header><p class="dialog-intro">Choose a reason. The report will move to the sample rejected queue.</p><label class="review-field"><span>Reason</span><select name="reason" required><option>Payment not received</option><option>Wrong amount</option><option>Unreadable receipt</option><option>Duplicate payment</option><option>Wrong recipient</option><option>Other</option></select></label><label class="review-field"><span>Message <small>optional</small></span><textarea name="note" rows="3" maxlength="200"></textarea></label><div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog>Cancel</button><button type="submit" class="danger-button">Reject sample payment</button></div></form>`;
  else if (action === 'sms') dialog.innerHTML = `<form id="wallet-sms-form"><header class="dialog-head"><h2>Paste wallet SMS</h2><button type="button" class="square-button" data-close-dialog aria-label="Close SMS editor">×</button></header><p class="dialog-intro">Use a fictional received-payment message to fill the transaction, amount, and provider fields.</p><label class="review-field"><span>Received-payment message</span><textarea name="sms" rows="5" maxlength="12000" required placeholder="Received UGX 5,000. Transaction ID: MTN-DEMO-000001. MTN MoMo."></textarea></label><p id="sms-feedback" class="field-note" role="status"></p><div class="dialog-actions"><button type="button" class="secondary-button" data-close-dialog>Cancel</button><button type="submit" class="primary-button">Apply to payment fields</button></div></form>`;
  else if (action === 'proof') dialog.innerHTML = `<header class="dialog-head"><h2>Evidence preview</h2><button type="button" class="square-button" data-close-dialog aria-label="Close evidence preview">×</button></header>${proof(payment, true)}`;
  else if (action === 'subscriber') dialog.innerHTML = `<header class="dialog-head"><h2>Sample subscriber</h2><button type="button" class="square-button" data-close-dialog aria-label="Close subscriber">×</button></header><p class="dialog-intro">The live action opens the subscriber record.</p><dl class="facts">${fact('Account', escape(payment.account))}${fact('Phone', payment.phone)}${fact('Status', 'Active demo account')}</dl>`;
  else return; dialog.showModal();
}
document.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null, design = target?.closest('[data-design]');
  if (design) { const fromGallery = !!design.closest('#gallery'); selectConcept(design.dataset.design); if ($('gallery').open) $('gallery').close(); (fromGallery ? $('open-gallery') : $('design-strip').querySelector(`[data-design="${state.concept.id}"]`))?.focus({ preventScroll: true }); return; }
  const row = target?.closest('.payment-row[data-payment]');
  if (row) { state.selected[state.status] = row.dataset.payment; renderList(); $('payment-list').querySelector(`[data-payment="${row.dataset.payment}"]`)?.focus({ preventScroll: true }); return; }
  const status = target?.closest('[data-status-tab]');
  if (status) { state.status = status.dataset.statusTab; renderTabs(); renderList(); $('list-scroll').scrollTop = 0; $('status-tabs').querySelector(`[data-status-tab="${state.status}"]`)?.focus({ preventScroll: true }); return; }
  const copy = target?.closest('[data-copy]');
  if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Payment reference copied.'); } catch { toast(`Payment reference: ${copy.dataset.copy}`); } return; }
  if (target?.closest('[data-close-dialog]')) { $('action-dialog').close(); return; }
  const action = target?.closest('button[data-action]')?.dataset.action;
  if (action === 'clear-search') { state.search = ''; state.provider = 'all'; $('search').value = ''; $('provider-filter').value = 'all'; renderList(); $('search').focus(); }
  else if (action) openAction(action);
  if (target?.closest('[data-preview-nav]')) { event.preventDefault(); toast('Payments layout preview. Other dashboard sections are shown for context.'); }
});
function saveEdits(event) {
  const target = event.target; if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.id === 'search') { state.search = target.value; renderList(); return; }
  const form = target.closest('[data-payment-form]');
  if (form) { if (target.name === 'transaction') target.value = target.value.toUpperCase().replace(/\s+/gu, ''); state.edits.set(form.dataset.paymentForm, Object.fromEntries(new FormData(form))); const payment = selectedPayment(); if (payment) { updateTransfer(payment); if (target.name === 'network') document.querySelector('.review-heading > .network-mark').outerHTML = networkMark(target.value); } }
}
document.addEventListener('input', saveEdits); document.addEventListener('change', saveEdits);
document.addEventListener('submit', (event) => {
  const form = event.target; if (!(form instanceof HTMLFormElement) || !form.matches('[data-payment-form], #reject-sample-form, #wallet-sms-form')) return;
  event.preventDefault(); const payment = selectedPayment(); if (!payment || payment.status !== 'pending') return;
  if (form.matches('[data-payment-form]')) { const values = Object.fromEntries(new FormData(form)); if (validAmount(values.amount) && validTransaction(values.transaction)) resolvePayment(payment, 'approved', values); }
  else if (form.id === 'reject-sample-form') { const values = new FormData(form); $('action-dialog').close(); resolvePayment(payment, 'rejected', { ...valuesFor(payment), note: String(values.get('note')) }, String(values.get('reason'))); }
  else {
    const text = String(new FormData(form).get('sms')), amount = text.match(/(?:UGX|USH|UShs?)\s*([\d,]+)(?:\.00)?/iu), transaction = text.match(/(?:transaction\s*(?:ID)?|trans\s*ID|reference|ref)\s*[:#]?\s*([A-Z0-9.\-]{4,40})/iu);
    if (!amount || !transaction) { $('sms-feedback').textContent = 'Include an amount labeled UGX and a transaction ID or reference. You can also edit the fields directly.'; return; }
    const values = { ...valuesFor(payment), amount: amount[1].replaceAll(',', ''), transaction: transaction[1].toUpperCase(), network: /airtel/iu.test(text) ? 'airtel' : /mtn|momo/iu.test(text) ? 'mtn' : valuesFor(payment).network };
    state.edits.set(payment.id, values); $('action-dialog').close(); renderDetails(payment); document.querySelector('[name="amount"]')?.focus({ preventScroll: true }); toast('Sample SMS applied. Review the editable fields before approving.');
  }
});
$('provider-filter').addEventListener('change', (event) => { state.provider = event.target.value; renderList(); $('list-scroll').scrollTop = 0; });
$('sort-order').addEventListener('change', (event) => { state.sort = event.target.value; renderList(); $('list-scroll').scrollTop = 0; });
$('previous-payment').addEventListener('click', () => stepPayment(-1)); $('next-payment').addEventListener('click', () => stepPayment(1));
$('open-gallery').addEventListener('click', () => $('gallery').showModal()); $('close-gallery').addEventListener('click', () => $('gallery').close());
for (const id of ['gallery', 'action-dialog']) $(id).addEventListener('click', (event) => { if (event.target === $(id)) $(id).close(); });
$('previous-design').addEventListener('click', () => selectConcept(concepts[(concepts.indexOf(state.concept) + 9) % 10].id));
$('next-design').addEventListener('click', () => selectConcept(concepts[(concepts.indexOf(state.concept) + 1) % 10].id));
$('shortlist').addEventListener('click', () => { const id = state.concept.id; if (state.shortlist.has(id)) state.shortlist.delete(id); else state.shortlist.add(id); storage.set('goal-hint.admin-payment-layouts.shortlist.v1', [...state.shortlist]); updateShortlist(); renderGallery(); toast(state.shortlist.has(id) ? `${id} ${state.concept.name} shortlisted.` : `${id} removed from shortlist.`); });
$('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('refresh-queue').addEventListener('click', () => { renderTabs(); renderList(); toast('Sample queue refreshed. There are no new reports.'); });
window.addEventListener('hashchange', () => selectConcept(location.hash.slice(1), false));
state.provider = $('provider-filter').value; state.sort = $('sort-order').value;
setTheme(storage.get('goal-hint.admin-payment-layouts.theme.v1', 'light') === 'dark' ? 'dark' : 'light'); renderTabs();
selectConcept(concepts.some((concept) => concept.id === location.hash.slice(1)) ? location.hash.slice(1) : '01');

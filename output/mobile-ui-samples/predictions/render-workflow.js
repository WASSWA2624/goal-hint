export const meta = {
  name: 'prediction-screen-samples',
  description: 'Build 5 direction samples for all 18 prediction-screen views as canvas artboards, audit uniformity per direction, then judge each screen side by side',
  phases: [
    { title: 'Build', detail: 'one builder per direction x screen group; writes .dc.html artboards and verifies renders' },
    { title: 'Audit', detail: 'per direction: cross-screen uniformity audit and fixes' },
    { title: 'Judge', detail: 'per screen: compare the 5 options on the 5 criteria, fix fidelity defects, recommend' },
  ],
}

const ROOT = 'D:/coding/apps/nextjs/goal-hint'
const OUT = ROOT + '/output/mobile-ui-samples/predictions'
const CANVAS = OUT + '/canvas'
const PROJECT = CANVAS + '/project'
const SHOTS = OUT + '/shots'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const DIRS = args.directions // [{letter:'a', name:'...'}]

const INV = {
  feed: 'feed.md', filters: 'filters.md', picker: 'filters.md (§4.5) + feed.md Completeness review',
  detail: 'detail.md', markets: 'markets.md', market: 'markets.md',
  stats: 'team.md', h2h: 'team.md', form: 'team.md', context: 'info.md', referee: 'info.md',
  lineups: 'squad.md', players: 'squad.md', injuries: 'squad.md', player: 'squad.md (§0.7)',
  news: 'info.md', history: 'info.md', snapshot: 'info.md (§4) + feed.md Completeness review',
}
const TITLES = {
  feed: 'Predictions feed', filters: 'Advanced filters', picker: 'Filter checklist', detail: 'Match details',
  markets: 'All Markets & Odds', market: 'Market panel', stats: 'Team Comparison', h2h: 'Head to Head',
  form: 'Team Form', lineups: 'Lineups', players: 'Players', news: 'News & Insights', injuries: 'Injuries & Suspensions',
  player: 'Player details', context: 'Match Context', referee: 'Referee', history: 'Prediction History', snapshot: 'Prediction snapshot',
}
const STATES = {
  feed: ['F1 Today'], filters: ['S1 Draft'], picker: ['P1 Leagues'], detail: ['D1 Overview top', 'D2 Overview sections'],
  markets: ['M1 Popular list'], market: ['K1 Match result (1X2) top'], stats: ['T1 Open', 'T2 Metric item (Points per game)'],
  h2h: ['H1 Open', 'H2 Record panel'], form: ['R1 Open (Both teams)'], lineups: ['L1 Open (pitch)'], players: ['Y1 Open (page 1)'],
  news: ['N1 Open list', 'N2 News item'], injuries: ['I1 Open'], player: ['Q1 Player panel (Walace, from Players)'],
  context: ['C1 Open facts'], referee: ['Z1 Open'], history: ['HI1 Publications'], snapshot: ['SN1 Snapshot top'],
}
const boardW = s => STATES[s].length === 1 ? 390 : 804
const GROUPS = [
  { key: 'g1', screens: ['feed', 'filters', 'picker'] },
  { key: 'g2', screens: ['detail', 'markets', 'market'] },
  { key: 'g3', screens: ['stats', 'h2h', 'form'] },
  { key: 'g4', screens: ['lineups', 'players', 'injuries', 'player', 'referee'] },
  { key: 'g5', screens: ['news', 'context', 'history', 'snapshot'] },
]
const ALL = GROUPS.flatMap(g => g.screens)

// feed-a is the canvas entry artboard and must live at project/Main.dc.html.
const fileOf = (screen, letter) => screen === 'feed' && letter === 'a' ? 'Main.dc.html' : `${screen}/${screen}-${letter}.dc.html`
const kitHref = (screen, letter) => screen === 'feed' && letter === 'a' ? 'kit.css' : '../kit.css'
const linkOf = (screen, letter) => '/' + fileOf(screen, letter)

const FORMAT = `
ARTBOARD FORMAT (Design canvas ".dc.html" — follow exactly, each rule fails silently):
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{Screen title} — Option {LETTER}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="{KIT_HREF}">
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
body{margin:0}
/* only tiny screen-specific layout rules here; components come from kit.css */
</style>
</helmet>
<div class="gh-boardset" style="width: {W}px; height: {H}px; display: flex; gap: 24px; align-items: flex-start; box-sizing: border-box; background: var(--gh-page);">
  <figure class="gh-board">
    <figcaption class="gh-board__cap">{LETTER} · {screen} · {state caption}</figcaption>
    <div class="gh-phone dir-{letter}"> ... top bar, sticky rows, main.gh-screen, dock (E), tab bar ... </div>
  </figure>
  (a second <figure> only when two states are listed for the screen)
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":{H}}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
Rules: keep the support.js line EXACTLY; the kit <link> goes right after it in <head>. Close every non-void element, double-quote every attribute. Root .gh-boardset fixed at W x H px: W = 390 for one state, 804 for two side by side; H = 844 + caption height + gap (measure it, ~873) — each phone is exactly the §2.1 390x844 viewport (.gh-phone, overflow hidden). Static markup only — no {{holes}}, no <sc-*>, no script-built UI, no <iframe>/<object>/<embed>, no emoji, no fake phone status bar. Icons: inline stroke <svg> using class="gh-ico" (or the kit's icon class) for stroke styling — keep SVG attributes to viewBox, d, cx, cy, r, x, y, width, height, points, x1..y2, aria-hidden, role, aria-label (no stroke-width/stroke-linecap attributes: style via CSS class). Real <button>, <a href>, <input> + <label for>, aria-label on icon-only buttons, decorative SVG aria-hidden="true". Prototype links: where the spec says a control navigates to another screen of the SAME direction, use <a href="{canvas-root path}"> with a leading slash, e.g. <a href="/detail/detail-{letter}.dc.html"> (feed option A is "/Main.dc.html"). Style the <a> itself as the button. Do not link to screens outside the 18.`

const COMMON = `
Project: GoalHint at ${ROOT} (read-only on src/; never modify app source). Owner's brief: ${ROOT}/prompts/mobile-ui-improvements.md — 5 mobile UI samples per screen, judged on Uniformity, Simplicity, Accessibility, Easy navigation, Short flows; base samples on existing screens/content; do NOT invent content or add features outside scope.
Design spec (authoritative): ${OUT}/directions.md — read the Shared rules, your direction's full spec, and the per-screen specs you are building. Shared stylesheet: ${PROJECT}/kit.css (read it fully; use its gh-* classes and tokens; do NOT edit kit.css — if a component is missing, add minimal screen-local CSS in <helmet><style> using kit tokens and report it).
Inventories with exact labels/fields/states: ${OUT}/inventory/*.md. Exact strings: ${ROOT}/src/i18n/messages/en.ts. Current-UI reference screenshots: ${OUT}/reference/*.jpg. Approved component treatments per direction: ${CANVAS}/kit-preview.png (view it) and its markup ${CANVAS}/kit-preview.html (copy patterns from it, incl. the icon sprite).
Sample data: use directions.md §2.7 "Canonical sample data" VERBATIM (RB Bragantino v Cruzeiro for every detail-family screen; the listed feed rows) — nothing else. Shared chrome (§2.5), icon sheet (§2.6) and artboard rules (§2.1) are mandatory.
Render check: headless Chrome — "${CHROME}" --headless=new --disable-gpu --hide-scrollbars --window-size={W+30},{H+30} --timeout=8000 --screenshot=<windows path to PNG> "file:///<path to .dc.html>" (Bash tool; cygpath -w for Windows paths). Save PNGs to ${SHOTS}/{screen}-{letter}.png. View each PNG with Read; fix clipping, overflow, overlap, unreadable text, broken icons, font fallback; re-render until clean. Also run a quick well-formedness check (e.g. python -c with html.parser counting unclosed non-void tags) on every file.`

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    artboards: { type: 'array', items: { type: 'object', properties: {
      screen: { type: 'string' }, file: { type: 'string', description: 'path under project/' }, height: { type: 'number' },
      shot: { type: 'string' }, summary: { type: 'string', description: 'what this option does on this screen, 1-2 sentences' },
      links: { type: 'array', items: { type: 'string' } }, localCss: { type: 'string', description: 'any screen-local CSS added and why, or "none"' },
    }, required: ['screen', 'file', 'height', 'shot', 'summary', 'links', 'localCss'] } },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['artboards', 'issues'],
}

function buildPrompt(d, g) {
  const files = g.screens.map(s => `- ${s} (${TITLES[s]}): write ${PROJECT}/${fileOf(s, d.letter)} with kit href "${kitHref(s, d.letter)}"; inventory ${INV[s]}. Draw ONLY these states from the §2.1 artboard set, each as one 390x844 <figure class="gh-board"> phone: ${STATES[s].join(' + ')} (artboard root width ${boardW(s)}px).`).join('\n')
  return `${COMMON}\n${FORMAT.replace('{KIT_HREF}', 'see per-file kit href below')}\n\nYOU BUILD: Option ${d.letter.toUpperCase()} — "${d.name}" (root class dir-${d.letter}) for these screens:\n${files}\n` +
    `Other screens of this direction live at: ${ALL.map(s => `${s}=${linkOf(s, d.letter)}`).join(', ')}.\n` +
    `Follow the direction spec precisely so your screens match the other screens of Option ${d.letter.toUpperCase()} built by other agents (same top bar, tab bar, back/close pattern, section template, item panel, spacing). Make each screen a polished, realistic phone screen in the dark theme. Return the artboards you wrote.`
}

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    fixes: { type: 'array', items: { type: 'string' } },
    heights: { type: 'array', items: { type: 'object', properties: { screen: { type: 'string' }, height: { type: 'number' } }, required: ['screen', 'height'] } },
    uniformityScore: { type: 'number', description: '1-5 after fixes' },
    remaining: { type: 'array', items: { type: 'string' } },
  },
  required: ['fixes', 'heights', 'uniformityScore', 'remaining'],
}

phase('Build')
const perDirection = await parallel(DIRS.map(d => async () => {
  const built = await parallel(GROUPS.map(g => () => agent(buildPrompt(d, g), { label: `build:${d.letter}:${g.key}`, phase: 'Build', schema: BUILD_SCHEMA })))
  const artboards = built.filter(Boolean).flatMap(b => b.artboards)
  const missing = ALL.filter(s => !artboards.some(a => a.screen === s))
  if (missing.length) log(`Option ${d.letter.toUpperCase()}: missing ${missing.join(', ')}`)
  const audit = await agent(`${COMMON}\n${FORMAT.replace('{KIT_HREF}', 'kit.css for project/Main.dc.html, ../kit.css elsewhere')}\n\nYou are the UNIFORMITY AUDITOR for Option ${d.letter.toUpperCase()} — "${d.name}". Different agents built its ${ALL.length} artboards: ${ALL.map(s => `${PROJECT}/${fileOf(s, d.letter)}`).join(', ')}.\n` +
    `Render every artboard (screenshots to ${SHOTS}/{screen}-${d.letter}.png) and view them all. Then make them uniform per the direction spec: identical top bar / tab bar / back-close pattern / section template / item panel / chip, button, card and row treatments / spacing / type sizes; consistent sample data (same fixture, same values for the same fields across screens); prototype links correct (leading-slash canvas paths that exist); no invented content or features (check against inventories); accessibility (44px targets, labels, contrast via kit tokens). Fix the files directly (you own only Option ${d.letter.toUpperCase()} files; never edit kit.css or other options). Re-render changed files and re-check. ${missing.length ? 'These screens are MISSING — build them yourself per the spec: ' + missing.join(', ') + '.' : ''} Return fixes, final heights per screen, a 1-5 uniformity score, and anything still wrong.`,
    { label: `audit:${d.letter}`, phase: 'Audit', schema: AUDIT_SCHEMA })
  return { letter: d.letter, name: d.name, artboards, audit }
}))

phase('Judge')
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    screen: { type: 'string' },
    options: { type: 'array', items: { type: 'object', properties: {
      letter: { type: 'string' },
      scores: { type: 'object', properties: { uniformity: { type: 'number' }, simplicity: { type: 'number' }, accessibility: { type: 'number' }, navigation: { type: 'number' }, shortFlows: { type: 'number' } }, required: ['uniformity', 'simplicity', 'accessibility', 'navigation', 'shortFlows'] },
      strengths: { type: 'string' }, weaknesses: { type: 'string' }, tapsToCoreTask: { type: 'string' },
    }, required: ['letter', 'scores', 'strengths', 'weaknesses', 'tapsToCoreTask'] } },
    fixesApplied: { type: 'array', items: { type: 'string' } },
    recommended: { type: 'string', description: 'letter' },
    rationale: { type: 'string' },
  },
  required: ['screen', 'options', 'fixesApplied', 'recommended', 'rationale'],
}
const judged = await parallel(ALL.map(s => () => agent(
  `${COMMON}\n${FORMAT.replace('{KIT_HREF}', 'kit.css for project/Main.dc.html, ../kit.css elsewhere')}\n\nYou are the JUDGE for screen "${s}" (${TITLES[s]}). The five options are: ${DIRS.map(d => `${d.letter.toUpperCase()} "${d.name}" = ${PROJECT}/${fileOf(s, d.letter)}`).join('; ')}. Their direction-wide audits are done.\n` +
  `Render all five (screenshots to ${SHOTS}/${s}-{letter}.png) and view them side by side, with the current UI reference screenshots and the inventory (${INV[s]}) for this screen. Adversarially check each option for: invented content/features or wrong labels vs inventory/en.ts; missing must-keep content (disclaimers, states, labels); rendering defects; accessibility defects. FIX real defects directly in the files (minimal edits that keep the option's direction-wide treatment; never touch kit.css), re-render to confirm.\n` +
  `Then score each option 1-5 on Uniformity (consistency with its own direction's other screens and shared components), Simplicity, Accessibility, Easy navigation, Short flows (count taps for the screen's core task from the feed), list strengths/weaknesses, and recommend the best option for this screen with a short rationale. Be discriminating — do not give everything 4s.`,
  { label: `judge:${s}`, phase: 'Judge', schema: JUDGE_SCHEMA })))

return { directions: perDirection, judged: judged.filter(Boolean), failedJudges: ALL.filter((s, i) => !judged[i]) }

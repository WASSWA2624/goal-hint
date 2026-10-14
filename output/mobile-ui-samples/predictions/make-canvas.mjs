// Builds canvas/project/canvas.json from the sample workflow result (one page per screen, five options per row).
import fs from "node:fs";
import path from "node:path";

const [resultFile, nowIso] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const project = path.join(here, "canvas", "project");
const raw = JSON.parse(fs.readFileSync(resultFile, "utf8"));
const result = raw.result ?? raw;

const screens = ["feed", "filters", "picker", "detail", "markets", "market", "stats", "h2h", "form", "lineups", "players",
  "news", "injuries", "player", "context", "referee", "history", "snapshot"];
const titles = {
  feed: "Predictions feed", filters: "Advanced filters", picker: "Filter checklist", detail: "Match details",
  markets: "All Markets & Odds", market: "Market panel", stats: "Team Comparison", h2h: "Head to Head", form: "Team Form",
  lineups: "Lineups", players: "Players", news: "News & Insights", injuries: "Injuries & Suspensions", player: "Player details",
  context: "Match Context", referee: "Referee", history: "Prediction History", snapshot: "Prediction snapshot",
};
const names = { a: "Refined Accordion", b: "Sheet Stack", c: "Page Stack", d: "Tabbed Hub", e: "Thumb Dock" };
const letters = ["a", "b", "c", "d", "e"];
const fileOf = (s, l) => (s === "feed" && l === "a" ? "Main.dc.html" : `${s}/${s}-${l}.dc.html`);
const criteria = [["uniformity", "Uniformity"], ["simplicity", "Simplicity"], ["accessibility", "Accessibility"],
  ["navigation", "Navigation"], ["shortFlows", "Short flows"]];

// Read each artboard's own declared size so the frame always matches the file.
function sizeOf(file) {
  const html = fs.readFileSync(path.join(project, file), "utf8");
  const m = html.match(/"\$preview"\s*:\s*\{\s*"width"\s*:\s*(\d+)\s*,\s*"height"\s*:\s*(\d+)/);
  if (!m) throw new Error(`no $preview in ${file}`);
  return { w: Number(m[1]), h: Number(m[2]) };
}

const judged = Object.fromEntries((result.judged ?? []).map((j) => [j.screen, j]));
const boards = {}, order = [], notes = {}, pages = [];
for (const s of screens) {
  pages.push({ id: s, name: titles[s] });
  let x = 0, rowH = 0;
  for (const l of letters) {
    const file = fileOf(s, l);
    if (!fs.existsSync(path.join(project, file))) { console.error(`missing ${file}`); continue; }
    const { w, h } = sizeOf(file);
    boards[file] = { x, y: 0, w, h, title: `${l.toUpperCase()} · ${names[l]}`, page: s };
    order.push(file);
    x += w + 80;
    rowH = Math.max(rowH, h);
  }
  const rowW = x - 80;
  notes[`${s}-title`] = { x: 0, y: -300, text: titles[s], kind: "title1", maxW: rowW, page: s };
  const j = judged[s];
  if (j) {
    const lines = [`Review: ${titles[s]}`, `Recommended: ${j.recommended.toUpperCase()} · ${names[j.recommended.toLowerCase()]}`, j.rationale, ""];
    for (const o of [...j.options].sort((a, b) => a.letter.localeCompare(b.letter))) {
      const total = criteria.reduce((n, [k]) => n + o.scores[k], 0);
      lines.push(`${o.letter.toUpperCase()} · ${names[o.letter.toLowerCase()]}: ${total}/25`);
      lines.push(criteria.map(([k, label]) => `${label} ${o.scores[k]}`).join(" · "));
      lines.push(`Core task: ${o.tapsToCoreTask}`);
      lines.push(`+ ${o.strengths}`);
      lines.push(`− ${o.weaknesses}`);
      lines.push("");
    }
    notes[`${s}-review`] = { x: rowW + 120, y: 0, text: lines.join("\n").trim(), w: 640, maxH: Math.max(rowH, 900), fill: "teal", size: "s", page: s };
  }
}
notes["legend"] = {
  x: 0, y: 1000, w: 1200, size: "s", fill: "gray", page: "feed",
  text: ["Options (each applied the same way on all 18 pages)",
    "A · Refined Accordion: today's structure; cards and filters open in place with sticky headers.",
    "B · Sheet Stack: two stable base screens; everything else rises in one bottom sheet.",
    "C · Page Stack: a tree of full pages with one app bar and a named back button.",
    "D · Tabbed Hub: flat peers in sticky tab strips (date tabs, section tabs, filter tabs).",
    "E · Thumb Dock: a dock above the tab bar with up and previous/next stepping."].join("\n"),
};

const canvas = {
  v: 3, createdOnFiles: { v: 1, at: nowIso }, title: "GoalHint Prediction Screen Samples",
  launch: { view: "canvas", page: "feed" }, pages, boards, order, notes, designSystems: [],
};
fs.writeFileSync(path.join(project, "canvas.json"), JSON.stringify(canvas, null, 1));
console.log(`${order.length} artboards on ${pages.length} pages; ${Object.keys(notes).length} notes`);

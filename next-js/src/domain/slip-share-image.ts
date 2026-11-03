import { utcInstantFromEpochMilliseconds } from "./calendar.ts";
import { predictionDescription, predictionLabel } from "./prediction-label.ts";
import { publicPolicy } from "./public-policy.ts";
import { slipBuilderRules } from "./slip-builder.ts";
import type { SharedSlip } from "./shared-slips.ts";
import { createMessages } from "../i18n/messages.ts";
import type { SlipStatus } from "./slip-status.ts";

/** One sequentially reused canvas stays below common browser dimension limits. */
export const slipShareImageRules = Object.freeze({
  width: 1080,
  maximumHeight: 8192,
  maximumRowsPerImage: 32,
  padding: 60,
  contentInset: 20,
  numberWidth: 140,
  leagueSize: 28,
  teamSize: 32,
  teamGap: 12,
  versusGap: 80,
  headerHeight: 294,
  rowGap: 16,
  minimumRowHeight: 156,
  footerPadding: 24,
});

export const slipShareImageFonts = Object.freeze({
  brand: { size: 54, lineHeight: 68, weight: 800 },
  heading: { size: 26, lineHeight: 38, weight: 600 },
  metadata: { size: 23, lineHeight: 32, weight: 400 },
  teams: { size: 31, lineHeight: 43, weight: 700 },
  pick: { size: 28, lineHeight: 39, weight: 500 },
  odds: { size: 32, lineHeight: 43, weight: 700 },
  total: { size: 48, lineHeight: 62, weight: 800 },
  metric: { size: 38, lineHeight: 50, weight: 700 },
  matchNumber: { size: 22, lineHeight: 30, weight: 700 },
  footer: { size: 23, lineHeight: 34, weight: 400 },
});

export type SlipShareImageFont = keyof typeof slipShareImageFonts;
export type SlipShareTextMeasure = (text: string, font: SlipShareImageFont) => number;
export type SlipShareImageRow = Readonly<{
  fixtureId: string;
  selectionIndex: number;
  top: number;
  height: number;
  metadata: readonly string[];
  numberLabel: string;
  teams: readonly string[];
  home: readonly string[];
  away: readonly string[];
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  competitionLogo: string | null;
  competitionName: string;
  pick: readonly string[];
  odds: string;
  probability: string;
  outcome: "correct" | "incorrect" | "pending" | "void";
}>;
export type SlipShareImagePage = Readonly<{
  width: number;
  height: number;
  index: number;
  pageCount: number;
  selectionCount: number;
  rows: readonly SlipShareImageRow[];
  created: string;
  reference: string;
  status: SlipStatus;
  statusLabel: string;
  totalOddsLabel: string;
  totalOdds: readonly string[];
  averageProbability: string;
  footerTotal: boolean;
  footerTop: number;
  footer: readonly string[];
  paginationLabel: string;
}>;

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Wrap complete words, falling back to grapheme boundaries for long names and URLs. */
export function wrapSlipShareImageText(value: string, maximumWidth: number, measure: (text: string) => number): string[] {
  if (!(maximumWidth > 0) || !Number.isFinite(maximumWidth)) throw new RangeError("Invalid image text width.");
  const words = value.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maximumWidth) { line = candidate; continue; }
    if (line) { lines.push(line); line = ""; }
    if (measure(word) <= maximumWidth) { line = word; continue; }
    const characters = Array.from(graphemes.segment(word), (part) => part.segment);
    let offset = 0;
    while (offset < characters.length) {
      let minimum = 1, maximum = characters.length - offset, fitting = 0;
      while (minimum <= maximum) {
        const count = Math.floor((minimum + maximum) / 2);
        if (measure(characters.slice(offset, offset + count).join("")) <= maximumWidth) {
          fitting = count; minimum = count + 1;
        } else maximum = count - 1;
      }
      // One oversized grapheme cannot be clipped or silently omitted.
      if (!fitting) throw new RangeError("A text character exceeds the image width.");
      const part = characters.slice(offset, offset + fitting).join("");
      offset += fitting;
      if (offset < characters.length) lines.push(part); else line = part;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Measured, deterministic pagination retains every original selection exactly once. */
export function layoutSlipShareImages(shared: SharedSlip, locale: string, measure: SlipShareTextMeasure): readonly SlipShareImagePage[] {
  const { slip } = shared;
  if (!slip.selections.length || slip.selections.length > slipBuilderRules.maximumSelections) throw new RangeError("Invalid image selection count.");
  const createdAt = Date.parse(shared.createdAt);
  if (!Number.isFinite(createdAt)) throw new RangeError("Invalid shared slip date.");
  const messages = createMessages(locale);
  const { width, padding, headerHeight, rowGap, minimumRowHeight, maximumHeight, maximumRowsPerImage, footerPadding } = slipShareImageRules;
  const { contentInset, numberWidth, leagueSize, teamSize, teamGap, versusGap } = slipShareImageRules;
  const contentWidth = width - padding * 2 - contentInset * 2;
  const priceWidth = Math.max(...slip.selections.map(selection => measure(`${messages.text("slips.odds")} ${selection.odds}`, "heading")))
    + measure(`${messages.text("slips.probability")} 100.0%`, "metadata") + 48;
  if (priceWidth >= contentWidth - 160) throw new RangeError("Invalid selection odds width.");
  const wrap = (text: string, font: SlipShareImageFont, available = contentWidth) => wrapSlipShareImageText(text, available, (value) => measure(value, font));
  const totalOdds = wrap(slip.totalOdds, "total");
  const footerTotal = totalOdds.length > 1 || measure(slip.totalOdds, "total") > 340;
  const footer = wrap([
    messages.text("slipShare.createdWith", { name: publicPolicy.name }), new URL(publicPolicy.origin).host,
    ...(shared.contacts ?? []),
    ...(shared.capturedAt ? [messages.text("slipShare.captured", { date: messages.reportingInstant(utcInstantFromEpochMilliseconds(Date.parse(shared.capturedAt))) })] : []),
    ...(shared.url ? [shared.url] : []),
  ].join(" · "), "footer");
  const footerHeight = footerPadding * 2 + (footerTotal ? slipShareImageFonts.heading.lineHeight
    + totalOdds.length * slipShareImageFonts.total.lineHeight + 20 : 0)
    + footer.length * slipShareImageFonts.footer.lineHeight + slipShareImageFonts.footer.lineHeight;
  if (headerHeight + footerHeight + minimumRowHeight > maximumHeight) throw new RangeError("The slip footer exceeds the image limit.");
  const groups: SlipShareImageRow[][] = [];
  let rows: SlipShareImageRow[] = [], top = headerHeight;
  for (const [selectionIndex, selection] of slip.selections.entries()) {
    const kickoff = utcInstantFromEpochMilliseconds(selection.kickoffAt);
    const outcome = shared.selectionOutcomes?.[selection.fixtureId] ?? "pending";
    const settledLabel = outcome === "pending" ? "" : ` · ${messages.text(`slips.leg.${outcome}`)}`;
    const competitionName = selection.competition.name ?? messages.text("match.competitionUnknown");
    const numberLabel = messages.text("slipShare.matchNumber", { number: String(selectionIndex + 1).padStart(2, "0") });
    const metadata = wrap(`${competitionName} · ${messages.reportingInstant(kickoff)}${settledLabel}`, "metadata", contentWidth - numberWidth - leagueSize - 22);
    const homeName = selection.homeTeam.name?.trim() || messages.text("match.homeUnknown");
    const awayName = selection.awayTeam.name?.trim() || messages.text("match.awayUnknown");
    const teamWidth = (contentWidth - versusGap) / 2 - teamSize - teamGap;
    const home = wrap(homeName, "teams", teamWidth), away = wrap(awayName, "teams", teamWidth);
    const teams = wrap(`${homeName} vs ${awayName}`, "teams");
    const description = selection.selection === "yes" || selection.selection === "no"
      ? predictionLabel(messages, selection.selection) : predictionDescription(messages, selection.selection);
    const pick = wrap(`${messages.text(`market.family.${selection.family}`)}: ${description}`, "pick", contentWidth - priceWidth);
    const height = Math.max(minimumRowHeight, metadata.length * slipShareImageFonts.metadata.lineHeight
      + Math.max(home.length, away.length) * slipShareImageFonts.teams.lineHeight
      + Math.max(pick.length * slipShareImageFonts.pick.lineHeight, slipShareImageFonts.heading.lineHeight) + 62);
    if (headerHeight + height + rowGap + footerHeight > maximumHeight) throw new RangeError("A selection exceeds the image limit.");
    if (rows.length && (rows.length >= maximumRowsPerImage || top + height + rowGap + footerHeight > maximumHeight)) {
      groups.push(rows); rows = []; top = headerHeight;
    }
    rows.push({ fixtureId: selection.fixtureId, selectionIndex, top, height, metadata, numberLabel, teams, home, away, homeName, awayName,
      homeLogo: selection.homeTeam.logoUrl ?? null, awayLogo: selection.awayTeam.logoUrl ?? null,
      competitionLogo: selection.competition.logoUrl ?? null, competitionName,
      pick, odds: selection.odds, probability: messages.number(selection.probability, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      outcome });
    top += height + rowGap;
  }
  if (rows.length) groups.push(rows);
  return groups.map((pageRows, index): SlipShareImagePage => {
    const last = pageRows[pageRows.length - 1]!;
    const footerTop = last.top + last.height + rowGap;
    return {
      width, height: footerTop + footerHeight - (groups.length === 1 ? slipShareImageFonts.footer.lineHeight : 0), index, pageCount: groups.length,
      selectionCount: slip.selections.length, rows: pageRows,
      created: messages.reportingInstant(utcInstantFromEpochMilliseconds(createdAt)),
      reference: shared.number ?? shared.id, status: shared.status ?? "pending",
      statusLabel: messages.text(shared.status === "not-started" ? "slipShare.upcoming" : !shared.status || shared.status === "pending" ? "slipShare.awaitingResults" : `slips.header.${shared.status}`),
      totalOddsLabel: messages.text("slips.totalOdds"), totalOdds, footerTotal,
      averageProbability: messages.number(slip.averageProbability, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      footerTop, footer,
      paginationLabel: messages.text("feed.pagination.page", { first: messages.number(index + 1), total: messages.number(groups.length) }),
    };
  });
}

"use client";

import type { SharedSlip } from "@/domain/shared-slips";
import { layoutSlipShareImages, slipShareImageFonts, slipShareImageRules, type SlipShareImageFont, type SlipShareImagePage } from "@/domain/slip-share-image";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";
import { providerImageSource } from "@/components/ui/provider-image";
import { teamInitials } from "@/domain/match-card";
import { lightTheme } from "@/styles/theme";

// Portable exports use the shared light palette even when the sender uses dark mode.
const colors = Object.freeze({ paper: lightTheme.color.surface, ink: lightTheme.color.text,
  muted: lightTheme.color.mutedText, brand: lightTheme.color.brand, line: lightTheme.phoneCardFrame.border });

function fontFamily(): string {
  return getComputedStyle(document.body).fontFamily || lightTheme.media.fallbackFamily;
}

async function loadedFontFamily(): Promise<string> {
  if (!document.fonts) return lightTheme.media.fallbackFamily;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = await Promise.race([
      document.fonts.ready.then(() => true, () => false),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), 2500); }),
    ]);
    // A late webfont cannot change the widths of pages measured in the fallback.
    return loaded ? fontFamily() : lightTheme.media.fallbackFamily;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function setFont(context: CanvasRenderingContext2D, font: SlipShareImageFont, family: string): void {
  const style = slipShareImageFonts[font];
  context.font = `${style.weight} ${style.size}px ${family}`;
}

function renderPage(context: CanvasRenderingContext2D, page: SlipShareImagePage, locale: string, family: string, assets: ReadonlyMap<string, HTMLImageElement>): void {
  const { padding: panelLeft, contentInset, numberWidth, leagueSize, teamSize, teamGap, versusGap } = slipShareImageRules;
  const padding = panelLeft + contentInset, edge = page.width - padding;
  const panelWidth = page.width - panelLeft * 2;
  const rightColumn = edge - 250, rightText = rightColumn + 14;
  const messages = createMessages(locale);
  context.textBaseline = "top";
  context.direction = "ltr";
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, page.width, page.height);
  context.fillStyle = colors.brand;
  context.fillRect(0, 0, page.width, 162);
  const text = (value: string, x: number, y: number, font: SlipShareImageFont, color: string = colors.ink, align: CanvasTextAlign = "left") => {
    setFont(context, font, family); context.fillStyle = color; context.textAlign = align; context.fillText(value, x, y);
  };
  const lines = (values: readonly string[], x: number, y: number, font: SlipShareImageFont, color: string = colors.ink) => {
    values.forEach((value, index) => text(value, x, y + index * slipShareImageFonts[font].lineHeight, font, color));
    return y + values.length * slipShareImageFonts[font].lineHeight;
  };
  const rule = (y: number, color: string = colors.line, thickness = 2) => {
    context.fillStyle = color; context.fillRect(panelLeft, y, panelWidth, thickness);
  };

  const brand = assets.get("/brand/goal-hint-logo-inverse.png");
  if (brand) {
    const height = 58, width = height * brand.naturalWidth / brand.naturalHeight;
    context.drawImage(brand, padding, 26, Math.min(width, 430), height);
  } else text(publicPolicy.name, padding, 30, "brand", lightTheme.color.onBrand);
  text(messages.text("slips.slipTitle", { number: page.reference }).toLocaleUpperCase(locale), rightText, 42, "heading", lightTheme.color.onBrand);
  text(messages.text("slipShare.created", { date: page.created }), padding, 111, "metadata", lightTheme.color.onBrand);
  const statusColor = page.status === "won" ? lightTheme.color.outcome.correct : page.status === "lost" ? lightTheme.color.outcome.incorrect
    : page.status === "void" || page.status === "cancelled" ? lightTheme.color.outcome.void : lightTheme.color.outcome.pending;
  const progress = page.status === "not-started" || page.status === "in-progress";
  context.fillStyle = progress ? lightTheme.color.accent.blue.soft : statusColor.background;
  context.fillRect(rightColumn, 102, 250, 44);
  text(page.statusLabel, rightText, 110, "heading", progress ? lightTheme.color.accent.blue.text : statusColor.text);
  context.fillStyle = lightTheme.color.brandSoft;
  context.fillRect(panelLeft, 178, panelWidth, 100);
  text(page.totalOddsLabel, padding, 188, "metadata", colors.muted);
  if (!page.footerTotal) text(page.totalOdds.join(""), padding, 218, "total", page.status === "won" || page.status === "lost" ? statusColor.text : colors.brand);
  else text(messages.text("slipShare.totalBelow"), padding, 232, "metadata", colors.brand);
  text(messages.text("slips.average"), padding + 395, 188, "metadata", colors.muted);
  text(page.averageProbability, padding + 395, 224, "metric", colors.brand);
  text(messages.text("slips.header.matches"), rightText, 188, "metadata", colors.muted);
  text(messages.number(page.selectionCount), rightText, 224, "metric", colors.ink);

  function badge(source: string | null, name: string, x: number, y: number, size: number = teamSize) {
    const image = source ? assets.get(providerImageSource(source, 48)) : undefined;
    if (image) {
      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
    }
    else {
      context.fillStyle = lightTheme.color.brandSoft; context.fillRect(x, y, size, size);
      setFont(context, "metadata", family); context.fillStyle = colors.muted; context.textAlign = "center";
      context.fillText(teamInitials(name), x + size / 2, y + (size - slipShareImageFonts.metadata.size) / 2, size - 4);
    }
  }
  for (const row of page.rows) {
    let y = row.top + 12;
    context.fillStyle = lightTheme.color.brandSoft;
    const metadataHeight = row.metadata.length * slipShareImageFonts.metadata.lineHeight;
    context.fillRect(panelLeft, row.top + 4, panelWidth, metadataHeight + 12);
    context.fillStyle = colors.brand; context.fillRect(padding, row.top + 8, numberWidth, metadataHeight + 4);
    text(row.numberLabel, padding + numberWidth / 2, row.top + 8 + (metadataHeight + 4 - slipShareImageFonts.matchNumber.size) / 2,
      "matchNumber", lightTheme.color.onBrand, "center");
    const leagueX = padding + numberWidth + 12;
    badge(row.competitionLogo, row.competitionName, leagueX, y + 2, leagueSize);
    y = lines(row.metadata, leagueX + leagueSize + 10, y, "metadata", colors.muted) + 12;
    const awayX = padding + (page.width - padding * 2 + versusGap) / 2;
    const logoTop = y + (slipShareImageFonts.teams.lineHeight - teamSize) / 2;
    badge(row.homeLogo, row.homeName, padding, logoTop);
    badge(row.awayLogo, row.awayName, awayX, logoTop);
    lines(row.home, padding + teamSize + teamGap, y, "teams"); lines(row.away, awayX + teamSize + teamGap, y, "teams");
    text("VS", page.width / 2, y + 10, "metadata", colors.muted, "center");
    y += Math.max(row.home.length, row.away.length) * slipShareImageFonts.teams.lineHeight + 12;
    const tone = lightTheme.color.outcome[row.outcome];
    lines(row.pick, padding, y, "pick", row.outcome === "pending" ? colors.ink : tone.text);
    const probability = `${messages.text("slips.probability")} ${row.probability}`;
    setFont(context, "metadata", family);
    const probabilityWidth = context.measureText(probability).width;
    text(`${messages.text("slips.odds")} ${row.odds}`, edge - probabilityWidth - 32, y + 3, "heading", row.outcome === "pending" ? colors.brand : tone.text, "right");
    text(probability, edge, y + 5, "metadata", colors.muted, "right");
    if (row !== page.rows[page.rows.length - 1]) rule(row.top + row.height);
  }

  let y = page.footerTop + slipShareImageRules.footerPadding;
  rule(page.footerTop, colors.brand, 3);
  if (page.footerTotal) {
    text(page.totalOddsLabel, padding, y, "heading", colors.muted);
    y += slipShareImageFonts.heading.lineHeight;
    y = lines(page.totalOdds, padding, y, "total", colors.brand) + 20;
  }
  y = lines(page.footer, padding, y, "footer", colors.muted);
  if (page.pageCount > 1) text(page.paginationLabel, padding, y + 8, "footer", colors.muted);
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to create the slip image.")), "image/png");
  });
}

async function loadAssets(pages: readonly SlipShareImagePage[], signal?: AbortSignal): Promise<Map<string, HTMLImageElement>> {
  const sources = new Set(["/brand/goal-hint-logo-inverse.png"]);
  for (const row of pages.flatMap(page => page.rows)) for (const source of [row.homeLogo, row.awayLogo, row.competitionLogo]) {
    if (!source) continue;
    const local = providerImageSource(source, 48);
    if (local.startsWith("/") && !local.startsWith("//") && !/[\\\u0000-\u0020]/u.test(local)) sources.add(local);
  }
  const assets = new Map<string, HTMLImageElement>(), queue = [...sources], deadline = Date.now() + 12_000;
  // A small pool bounds requests and avoids retaining an unbounded batch of pending decoders.
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let source = queue.shift(); source; source = queue.shift()) {
      signal?.throwIfAborted();
      if (Date.now() >= deadline) break;
      const image = await new Promise<HTMLImageElement | null>(resolve => {
        const element = new Image();
        const finish = (loaded: boolean) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); element.onload = element.onerror = null; resolve(loaded ? element : null); };
        const abort = () => { element.src = ""; finish(false); };
        const timer = setTimeout(() => { element.src = ""; finish(false); }, Math.min(10_000, deadline - Date.now()));
        signal?.addEventListener("abort", abort, { once: true });
        element.onload = () => finish(true); element.onerror = () => finish(false); element.src = source;
      });
      if (image) assets.set(source, image);
    }
  }));
  signal?.throwIfAborted();
  return assets;
}

/** One measured canvas and bounded first-party badge loading preserve complete, portable exports. */
export async function createSlipShareImages(shared: SharedSlip, locale: string, signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void): Promise<File[]> {
  signal?.throwIfAborted();
  if (typeof document === "undefined") throw new Error("Slip image export requires a browser.");
  const family = await loadedFontFamily();
  signal?.throwIfAborted();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot create slip images.");
  const pages = layoutSlipShareImages(shared, locale, (value, font) => {
    setFont(context, font, family); return context.measureText(value).width;
  });
  const assets = await loadAssets(pages, signal);
  const files: File[] = [];
  try {
    for (const page of pages) {
      signal?.throwIfAborted();
      canvas.width = page.width; canvas.height = page.height;
      renderPage(context, page, locale, family, assets);
      const blob = await pngBlob(canvas);
      signal?.throwIfAborted();
      const suffix = pages.length > 1 ? `-${String(page.index + 1).padStart(2, "0")}` : "";
      files.push(new File([blob], `goal-hint-${shared.number ?? shared.id}${suffix}.png`, { type: "image/png", lastModified: Date.parse(shared.createdAt) }));
      onProgress?.(files.length, pages.length);
    }
    return files;
  } finally {
    // Release the backing pixel buffer even if the dialog closes during export.
    canvas.width = 0; canvas.height = 0;
  }
}

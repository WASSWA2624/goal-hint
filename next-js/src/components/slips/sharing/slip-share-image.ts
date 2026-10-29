"use client";

import type { SharedSlip } from "@/domain/shared-slips";
import { layoutSlipShareImages, slipShareImageFonts, slipShareImageRules, type SlipShareImageFont, type SlipShareImagePage } from "@/domain/slip-share-image";
import { publicPolicy } from "@/domain/public-policy";
import { createMessages } from "@/i18n/messages";

const colors = Object.freeze({ paper: "#FFFFFF", ink: "#15243B", muted: "#53647C", brand: "#2457C5", line: "#D9E1ED" });

function fontFamily(): string {
  return getComputedStyle(document.body).fontFamily || "Arial, sans-serif";
}

async function loadedFontFamily(): Promise<string> {
  if (!document.fonts) return "Arial, sans-serif";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loaded = await Promise.race([
      document.fonts.ready.then(() => true, () => false),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), 2500); }),
    ]);
    // A late webfont cannot change the widths of pages measured in the fallback.
    return loaded ? fontFamily() : "Arial, sans-serif";
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

function setFont(context: CanvasRenderingContext2D, font: SlipShareImageFont, family: string): void {
  const style = slipShareImageFonts[font];
  context.font = `${style.weight} ${style.size}px ${family}`;
}

function renderPage(context: CanvasRenderingContext2D, page: SlipShareImagePage, locale: string, family: string): void {
  const { padding } = slipShareImageRules;
  const edge = page.width - padding;
  const messages = createMessages(locale);
  context.textBaseline = "top";
  context.direction = "ltr";
  context.fillStyle = colors.paper;
  context.fillRect(0, 0, page.width, page.height);
  context.fillStyle = colors.brand;
  context.fillRect(0, 0, page.width, 10);
  const text = (value: string, x: number, y: number, font: SlipShareImageFont, color: string = colors.ink, align: CanvasTextAlign = "left") => {
    setFont(context, font, family); context.fillStyle = color; context.textAlign = align; context.fillText(value, x, y);
  };
  const lines = (values: readonly string[], x: number, y: number, font: SlipShareImageFont, color: string = colors.ink) => {
    values.forEach((value, index) => text(value, x, y + index * slipShareImageFonts[font].lineHeight, font, color));
    return y + values.length * slipShareImageFonts[font].lineHeight;
  };
  const rule = (y: number, color: string = colors.line, thickness = 2) => {
    context.fillStyle = color; context.fillRect(padding, y, page.width - padding * 2, thickness);
  };

  text(publicPolicy.name, padding, 46, "brand", colors.brand);
  text(page.created, padding, 124, "metadata", colors.muted);
  text(`Slip ${page.reference}`, padding, 164, "metadata", colors.muted);
  text(messages.plural("slips.selections", page.selectionCount), padding, 202, "heading");
  if (page.pageCount > 1) text(page.paginationLabel, edge, 202, "metadata", colors.muted, "right");
  rule(242, colors.brand, 3);

  for (const row of page.rows) {
    let y = row.top + 10;
    y = lines(row.metadata, padding, y, "metadata", colors.muted) + 5;
    y = lines(row.teams, padding, y, "teams") + 8;
    lines(row.pick, padding, y, "pick");
    text(row.odds, edge, y, "odds", colors.ink, "right");
    rule(row.top + row.height);
  }

  let y = page.footerTop + slipShareImageRules.footerPadding;
  text(page.totalOddsLabel, padding, y, "heading", colors.muted);
  y += slipShareImageFonts.heading.lineHeight;
  y = lines(page.totalOdds, padding, y, "total", colors.brand) + 20;
  rule(y - 8, colors.brand, 3);
  y = lines(page.footer, padding, y + 8, "footer", colors.muted);
  if (page.pageCount > 1) text(page.paginationLabel, padding, y + 8, "footer", colors.muted);
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to create the slip image.")), "image/png");
  });
}

/** Real PNGs use one measured canvas at a time; no provider images or HTML are fetched. */
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
  const files: File[] = [];
  try {
    for (const page of pages) {
      signal?.throwIfAborted();
      canvas.width = page.width; canvas.height = page.height;
      renderPage(context, page, locale, family);
      const blob = await pngBlob(canvas);
      signal?.throwIfAborted();
      const suffix = pages.length > 1 ? `-${String(page.index + 1).padStart(2, "0")}` : "";
      files.push(new File([blob], `goal-hint-${shared.id}${suffix}.png`, { type: "image/png", lastModified: Date.parse(shared.createdAt) }));
      onProgress?.(files.length, pages.length);
    }
    return files;
  } finally {
    // Release the backing pixel buffer even if the dialog closes during export.
    canvas.width = 0; canvas.height = 0;
  }
}

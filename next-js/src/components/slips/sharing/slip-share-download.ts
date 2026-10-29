"use client";

/** Multiple PNG pages download together, with a caption file, through one browser download. */
export async function createSlipShareDownload(files: readonly File[], id: string, caption: string): Promise<File> {
  if (!files.length) throw new Error("No slip images to download.");
  if (files.length === 1) return files[0]!;
  const { zipSync, strToU8 } = await import("fflate");
  const entries: Record<string, Uint8Array> = { "caption.txt": strToU8(caption) };
  for (const file of files) entries[file.name] = new Uint8Array(await file.arrayBuffer());
  const archive = zipSync(entries, { level: 0 });
  return new File([new Uint8Array(archive)], `goal-hint-${id}.zip`, { type: "application/zip" });
}

export function downloadSlipShare(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url; link.download = file.name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

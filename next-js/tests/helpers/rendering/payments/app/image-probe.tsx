"use client";
import { useState } from "react";
import { preparePaymentImage } from "@/components/members/payment-image";
/** A synthetic browser canvas verifies the real decoder/encoder without leaving this isolated fixture. */
export function ImageProbe() {
  const [result, setResult] = useState("");
  return <aside aria-label="Synthetic image acceptance" style={{ paddingBottom: 100 }}><button onClick={async () => {
    const rows = [];
    for (const height of [2400, 6000]) {
      const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = height;
      const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, 1080, height);
      context.fillStyle = "black"; context.font = "28px sans-serif";
      for (let line = 0; line < height; line += 48) context.fillText(`SYNTHETIC PAYMENT RECEIPT ${line}: UGX 5,000 Transaction ID TEST-1234`, 12, line + 32);
      const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
      const prepared = await preparePaymentImage(new File([png], "synthetic.png", { type: "image/png" }));
      const decoded = await createImageBitmap(prepared); rows.push(`${height}: ${decoded.width}×${decoded.height}, ${prepared.size} bytes`); decoded.close();
    }
    setResult(rows.join("; "));
  }}>Check synthetic screenshots</button><output>{result}</output></aside>;
}

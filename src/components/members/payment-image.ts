/** Browser-only re-encode strips metadata and bounds the upload without an image dependency. */
export async function preparePaymentImage(file: File): Promise<Blob> {
  let source: ImageBitmap | HTMLImageElement;
  try { source = await createImageBitmap(file); }
  catch {
    const url = URL.createObjectURL(file), image = new Image();
    try { image.src = url; await image.decode(); source = image; }
    finally { URL.revokeObjectURL(url); }
  }
  try {
    const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!width || !height) throw new Error("Choose a readable screenshot.");
    const scale = Math.min(1, 1080 / width, 4096 / height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(width * scale); canvas.height = Math.floor(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot prepare this image. Try another browser, or call admin.");
    const draw = () => { context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height); };
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Choose a readable screenshot.")), "image/jpeg", quality));
    draw();
    let output = await encode(0.75);
    for (const quality of [0.65, 0.55]) { if (output.size <= 400_000) break; output = await encode(quality); }
    if (output.size > 400_000 && canvas.width > 900) {
      canvas.height = Math.max(1, Math.floor(canvas.height * 900 / canvas.width)); canvas.width = 900;
      draw(); output = await encode(0.55);
    }
    if (output.size > 3_000_000 || Math.min(canvas.width, canvas.height) < 200) throw new Error("Choose a clearer, smaller screenshot.");
    return output;
  } finally { if ("close" in source) source.close(); }
}

export function uploadPayment(body: FormData, progress: (percentage: number) => void): Promise<{ reference: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/account/payments"); xhr.timeout = 90_000;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = xhr.ontimeout = () => reject(new Error("The upload did not finish. Your details are kept; try again."));
    xhr.onload = () => {
      let result;
      try { result = JSON.parse(xhr.responseText) as { reference?: string; message?: string }; } catch { /* A proxy may return a plain error page. */ }
      if (xhr.status >= 200 && xhr.status < 300 && result?.reference) resolve({ reference: result.reference });
      else reject(new Error(result?.message ?? "The upload did not finish. Your details are kept; try again."));
    };
    xhr.send(body);
  });
}

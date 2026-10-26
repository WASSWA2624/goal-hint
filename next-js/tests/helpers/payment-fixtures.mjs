import { randomUUID } from "node:crypto";
export function jpeg(width = 1080, height = 2400) {
  const bytes = Buffer.from([255, 216, 255, 192, 0, 17, 8, 0, 0, 0, 0, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217]);
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9); return bytes;
}
export const values = { purpose: "plan", planId: randomUUID(), topUpAmount: "", payerPhone: "0700000101", network: "mtn", transactionId: " tx.100-1 ", screenshotAmount: "5000", accepted: "true" };
export async function paymentRequest({ fields = {}, image = jpeg(), type = "image/jpeg", headers = {}, extra = false, duplicateFields = [] } = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...values, ...fields })) if (value !== undefined) data.set(key, value);
  if (image !== null) data.set("image", new File([image], "payment.jpg", { type }));
  if (extra) data.set("sms", "private message");
  for (const key of duplicateFields) data.append(key, data.get(key));
  const encoded = new Response(data), buffer = await encoded.arrayBuffer();
  return new Request("http://localhost/api/account/payments", { method: "POST", headers: { "sec-fetch-site": "same-origin", "content-length": String(buffer.byteLength), "content-type": encoded.headers.get("content-type"), ...headers }, body: buffer });
}

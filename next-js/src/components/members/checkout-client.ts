export async function sendCheckout<T>(body: Record<string, unknown>, image: Blob | null = null): Promise<T> {
  const data = new FormData(); data.set("payload", JSON.stringify(body));
  if (image) data.set("image", image, "payment.jpg");
  const response = await fetch("/api/account/checkout", { method: "POST", body: data, credentials: "same-origin" });
  const result = await response.json().catch(() => ({ message: "Unable to save. Your draft is kept; try again." }));
  if (!response.ok) throw new Error(result.message ?? "Unable to save. Your draft is kept; try again.");
  return result;
}

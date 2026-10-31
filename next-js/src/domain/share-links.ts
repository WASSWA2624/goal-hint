/** User-initiated HTTPS handoffs work in browsers and the native host. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?${new URLSearchParams({ text })}`;
}

export function telegramShareUrl(url: string, text: string): string {
  return `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
}

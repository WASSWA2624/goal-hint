/** Replace an installed production worker even when its saved page cannot hydrate. */
const retirementWorker = `
"use strict";
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await self.registration.unregister();
    try {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("goal-hint-offline-"))
        .map((name) => caches.delete(name)));
    } catch { /* Unavailable storage must not prevent recovery to the online app. */ }
    const windows = await self.clients.matchAll({ type: "window" });
    await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => {})));
  })());
});
`;

export function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(retirementWorker, { headers: {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Service-Worker-Allowed": "/",
  } });
}

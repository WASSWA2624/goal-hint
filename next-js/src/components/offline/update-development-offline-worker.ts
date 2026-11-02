/** Prompt recovery if this development document is still controlled by our old worker. */
export async function updateDevelopmentOfflineWorker(
  container: Pick<ServiceWorkerContainer, "getRegistration"> = navigator.serviceWorker,
): Promise<void> {
  const registration = await container.getRegistration("/");
  if (!registration) return;
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (worker && new URL(worker.scriptURL).pathname === "/offline-worker.js") {
    await registration.update();
  }
}

"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ActionButton, FieldError, Hint } from "./admin-form";
import { Inline } from "@/components/ui/layout";
import { reviewSoundEnabled, setReviewSound } from "./payment-alert-sound";
import { nativePaymentAlerts } from "@/domain/native-payment-alerts";
import { startRequestDeadline } from "@/domain/request-deadline";

type Endpoint = { id: string; transport: string; enabled: boolean; deliveries?: { status: string; displayedAt: string | null; openedAt: string | null }[] };
type Status = { scope: string; enabled: boolean; publicKey: string | null; endpoints: Endpoint[] };
const path = "/api/admin/payment-alerts";
const subscribePlatform = () => () => {};
const nativeSnapshot = () => /\bGoalHintNative\//u.test(navigator.userAgent);
async function post(body: object) {
  return alertRequest(body);
}
async function alertRequest(body?: object) {
  const controller = new AbortController(), clear = startRequestDeadline(controller);
  try {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal: controller.signal,
      ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.message ?? "Payment alerts are unavailable."); return result;
  } finally { clear(); }
}
export function PaymentAlertControls() {
  const [state, setState] = useState<Status | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [sound, setSound] = useState(false);
  const [permission, setPermission] = useState("Checking permission");
  const native = useSyncExternalStore(subscribePlatform, nativeSnapshot, () => false);
  const refresh = useCallback(async () => {
    try {
      setPermission("Notification" in window ? Notification.permission : "unavailable");
      const next: Status = await alertRequest(); setState(next); setSound(reviewSoundEnabled(next.scope));
      if (!native && "Notification" in window && Notification.permission === "denied") {
        for (const endpoint of next.endpoints.filter(endpoint => endpoint.transport === "web" && endpoint.enabled)) await post({ action: "mute", endpointId: endpoint.id });
      }
    } catch { /* Keep controls usable during a temporary outage. */ }
  }, [native]);
  useEffect(() => { void Promise.resolve().then(refresh); window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh); }, [refresh]);
  async function act(action: "enable" | "mute" | "test" | "settings") {
    if (busy) return; setBusy(true); setMessage("");
    try {
      if (native) {
        if (!/\bGoalHintNative\/(android|windows)\//u.test(navigator.userAgent)) throw new Error("Native payment alerts are unavailable on this platform. Use the payment queue.");
        const bridge = nativePaymentAlerts();
        if (!bridge) throw new Error("Update the app to enable native payment alerts.");
        const result = await bridge.request(action); setMessage(result.message ?? "Payment alert setting updated.");
      } else {
        if (!state) throw new Error("Reload to check payment alerts.");
        const endpoint = state.endpoints.find(endpoint => endpoint.transport === "web");
        if (action === "enable") {
          if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push is unavailable in this browser. Use the payment queue.");
          if (!state.publicKey) throw new Error("Web Push needs server configuration.");
          if (Notification.permission === "denied") throw new Error("Allow notifications in browser settings, then try again.");
          const permission = await Notification.requestPermission();
          if (permission !== "granted") throw new Error("Notifications are not enabled. The payment queue remains available.");
          const worker = await navigator.serviceWorker.register("/offline-worker.js", { scope: "/", updateViaCache: "none" });
          await navigator.serviceWorker.ready;
          const key = Uint8Array.from(atob(state.publicKey.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - state.publicKey.length % 4) % 4)), character => character.charCodeAt(0));
          const subscription = await worker.pushManager.getSubscription() ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
          await post({ action: "register", registration: { transport: "web", subscription: subscription.toJSON() } });
          setMessage(state.enabled ? "Alerts enabled on this browser." : "Browser registered. Outbound payment alerts are disabled.");
        } else {
          if (!endpoint) throw new Error("Enable alerts on this browser first.");
          await post({ action, endpointId: endpoint.id });
          if (action === "mute") {
            await setReviewSound(state.scope, false); setSound(false);
            const worker = await navigator.serviceWorker.getRegistration();
            const notifications = await worker?.getNotifications(); notifications?.forEach(notification => { if (notification.tag.startsWith("payment-review:")) notification.close(); });
          }
          setMessage(action === "test" ? "Test queued. Delivery has not been confirmed." : "Alerts muted on this browser.");
        }
      }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment alerts are unavailable."); }
    finally { setBusy(false); }
  }
  const endpoint = state?.endpoints.find(endpoint => endpoint.transport === (native ? /GoalHintNative\/windows\//u.test(navigator.userAgent) ? "windows-local" : "fcm" : "web"));
  const delivery = endpoint?.deliveries?.[0];
  return <div data-payment-alert-controls aria-busy={busy}>
    <Hint>{native ? "Native payment alerts" : `Browser notifications: ${permission}`} · {endpoint?.enabled ? "Enabled on this device" : "Not enabled on this device"}</Hint>
    {native && /\bGoalHintNative\/windows\//u.test(navigator.userAgent) && <Hint>Keep Goal Hint running to receive Windows alerts.</Hint>}
    {delivery && <Hint>Last test/delivery: {delivery.openedAt ? "Opened" : delivery.displayedAt ? "Displayed" : delivery.status === "accepted" ? "Provider accepted" : delivery.status}</Hint>}
    <Inline><ActionButton type="button" disabled={busy} onClick={() => void act(endpoint?.enabled ? "mute" : "enable")}>{endpoint?.enabled ? "Mute alerts" : "Enable alerts"}</ActionButton>
      <ActionButton type="button" disabled={busy || !endpoint?.enabled} onClick={() => void act("test")}>Test alert</ActionButton>
      {native && <ActionButton type="button" disabled={busy} onClick={() => void act("settings")}>Notification settings</ActionButton>}
      {!native && <ActionButton type="button" disabled={busy || !state} onClick={() => {
        if (!state) return; const next = !sound; setSound(next);
        void setReviewSound(state.scope, next).then(() => setMessage(next ? "Foreground sound enabled." : "Foreground sound muted.")).catch(() => setMessage("Sound was blocked. Visual alerts remain available."));
      }}>{sound ? "Mute sound" : "Enable sound"}</ActionButton>}
    </Inline>{message && <FieldError as="p" role="status">{message}</FieldError>}
  </div>;
}

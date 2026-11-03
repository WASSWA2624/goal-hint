export type NativePaymentAlertBridge = {
  request(action: "enable" | "mute" | "test" | "settings"): Promise<{ message?: string }>;
  clear(): Promise<unknown>;
};
declare global { interface Window { goalHintPaymentAlerts?: NativePaymentAlertBridge } }
export const nativePaymentAlerts = () => typeof window === "undefined" ? undefined : window.goalHintPaymentAlerts;

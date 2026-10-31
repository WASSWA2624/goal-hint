export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installClientAddressTransport } = await import("@/server/http/client-address");
    installClientAddressTransport();
    const { getRuntimePolicy } = await import("@/server/config/runtime-policy");
    getRuntimePolicy();
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getRuntimePolicy } = await import("@/server/config/runtime-policy");
    getRuntimePolicy();
  }
}

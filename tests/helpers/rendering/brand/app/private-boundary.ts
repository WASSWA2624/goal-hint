import "server-only";
export function verifyPrivateBoundary() { if (process.env.AI_API_KEY !== "brand_styling_secret_sentinel_do_not_ship_015") throw new Error("BRAND_STYLING_PRIVATE_ONLY_CANARY"); }


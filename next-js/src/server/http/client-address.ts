import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { subscribe } from "node:diagnostics_channel";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";

const proofHeader = "x-goal-hint-client-address";
const stateKey = Symbol.for("goal-hint.client-address");
type State = { key: Buffer; installed: boolean };
function state(): State {
  const shared = globalThis as typeof globalThis & { [stateKey]?: State };
  return shared[stateKey] ??= { key: randomBytes(32), installed: false };
}

function canonicalAddress(value: string | undefined): string | null {
  if (!value || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/u.exec(normalized);
  if (!mapped) return normalized;
  const high = parseInt(mapped[1]!, 16), low = parseInt(mapped[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

/** Only walk through explicitly trusted peers, from the actual socket towards the client. */
export function createClientAddressResolver(cidrs = "") {
  const trusted = new BlockList(), entries = cidrs.trim() ? cidrs.split(",") : [];
  if (entries.length > 32) throw new Error("Configure at most 32 explicit trusted proxy CIDRs.");
  for (const entry of entries) {
    const parts = entry.trim().split("/"), address = canonicalAddress(parts[0]);
    const family = address && isIP(address), bits = parts[1] === undefined ? family === 4 ? 32 : 128 : Number(parts[1]);
    if (!address || parts.length > 2 || parts[1] !== undefined && !/^\d{1,3}$/u.test(parts[1])
      || !Number.isInteger(bits) || bits < 1 || bits > (family === 4 ? 32 : 128))
      throw new Error("GOAL_HINT_TRUSTED_PROXY_CIDRS must contain explicit IP addresses or CIDRs; trust-all ranges are forbidden.");
    trusted.addSubnet(address, bits, family === 4 ? "ipv4" : "ipv6");
  }
  const isTrusted = (address: string) => trusted.check(address, isIP(address) === 4 ? "ipv4" : "ipv6");
  return (peer: string | undefined, forwarded?: string): string => {
    const socketAddress = canonicalAddress(peer);
    if (!socketAddress) return "unknown"; // Passenger/other adapters must expose a real peer before IP trust can be verified.
    if (!isTrusted(socketAddress) || !forwarded) return socketAddress;
    const hops = forwarded.split(",");
    let address = socketAddress;
    for (let index = hops.length - 1, walked = 0; index >= 0 && isTrusted(address); index--, walked++) {
      // Invalid/overlong trusted chains share the connecting proxy's bounded bucket.
      if (walked >= 32) return socketAddress;
      const next = canonicalAddress(hops[index]?.trim());
      if (!next) return socketAddress;
      address = next;
    }
    return address;
  };
}

const signature = (payload: string) => createHmac("sha256", state().key).update(payload).digest("hex");

/** Install once during Node instrumentation. Never let an HTTP header assert its own transport provenance. */
export function installClientAddressTransport() {
  const shared = state();
  if (shared.installed) return;
  const resolve = createClientAddressResolver(process.env.GOAL_HINT_TRUSTED_PROXY_CIDRS);
  subscribe("http.server.request.start", (message) => {
    const { request } = message as { request: IncomingMessage };
    const forwarded = request.headers["x-forwarded-for"];
    const address = resolve(request.socket.remoteAddress, Array.isArray(forwarded) ? forwarded.join(",") : forwarded);
    const payload = `${address}|${Date.now()}`;
    // A process-private signature survives Next's Headers conversion/bundles; it is never returned to a browser.
    request.headers[proofHeader] = `${payload}|${signature(payload)}`;
  });
  shared.installed = true;
}

/** Unsigned, malformed, replayed-after-deadline or missing transport facts fail into a bounded shared bucket. */
export function verifiedClientAddress(headers: Headers): string {
  const proof = headers.get(proofHeader);
  if (!proof || proof.length > 160) return "unknown";
  const parts = proof.split("|"), [address, stamp, digest] = parts;
  if (parts.length !== 3 || !address || !stamp || !/^\d{13}$/u.test(stamp) || !digest || !/^[a-f0-9]{64}$/u.test(digest)) return "unknown";
  const age = Date.now() - Number(stamp);
  if (age < 0 || age > 300_000 || address !== "unknown" && canonicalAddress(address) !== address) return "unknown";
  return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature(`${address}|${stamp}`), "hex")) ? address : "unknown";
}

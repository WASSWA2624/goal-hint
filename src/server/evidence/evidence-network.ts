import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

export type EvidenceSourceNetworkPolicy = Readonly<{
  sourceId: string;
  hosts: readonly string[];
  queryNames: readonly string[];
  contentTypes: readonly ("text/plain" | "text/html" | "application/xhtml+xml")[];
  maxRequests: number;
  maxRedirects: number;
  maxBytes: number;
  maxTextCharacters: number;
  timeoutMs: number;
  evidenceRef: string;
}>;
export type EvidenceNetworkReason = "invalid-policy" | "unsafe-url" | "unapproved-source" | "operation-not-authorized"
  | "unverified-policy" | "unsafe-address" | "dns-unavailable" | "request-limit" | "redirect-limit"
  | "redirect-loop" | "invalid-response" | "unsupported-content" | "response-too-large" | "invalid-text"
  | "timeout" | "aborted" | "network-unavailable";
type Denied = Readonly<{ status: "denied"; reason: EvidenceNetworkReason; requests: number }>;
export type EvidenceNetworkAddress = Readonly<{ address: string; family: 4 | 6 }>;
export type EvidencePinnedRequest = Readonly<{
  url: string; address: EvidenceNetworkAddress; signal: AbortSignal;
  headers: Readonly<Record<string, string>>;
}>;
export type EvidenceHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: AsyncIterable<Uint8Array>;
  close(): void;
}>;
export type EvidenceSourceFetchResult = Readonly<{
  status: "fetched"; sourceUrl: string; finalUrl: string; text: string;
  contentType: EvidenceSourceNetworkPolicy["contentTypes"][number]; requests: number; bytes: number;
}> | Denied;

const policyKeys = ["sourceId", "hosts", "queryNames", "contentTypes", "maxRequests", "maxRedirects", "maxBytes",
  "maxTextCharacters", "timeoutMs", "evidenceRef"];
const textTypes = ["text/plain", "text/html", "application/xhtml+xml"];
const sensitiveQuery = /token|secret|password|api.?key|authorization|credential|signature|^(?:key|auth|sig)$/i;
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const queryName = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const denied = (reason: EvidenceNetworkReason, requests = 0): Denied => Object.freeze({ status: "denied", reason, requests });
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown, ceiling: number): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= ceiling;
const nonnegative = (value: unknown, ceiling: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= ceiling;
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
function publicHostname(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 253 || value !== value.toLowerCase() || isIP(value) !== 0 ||
    /\.(?:localhost|local|internal|home|lan|test|invalid|onion)$/.test(value)) return false;
  const labels = value.split(".");
  return labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /^[a-z][a-z0-9-]*$/.test(labels.at(-1) ?? "");
}

/** No limits, permissions, source names or query parameters are inferred. */
export function parseEvidenceSourceNetworkPolicy(value: unknown): EvidenceSourceNetworkPolicy {
  if (!record(value) || Object.keys(value).some((key) => !policyKeys.includes(key)) ||
    typeof value.sourceId !== "string" || !identifier.test(value.sourceId) ||
    typeof value.evidenceRef !== "string" || !identifier.test(value.evidenceRef) ||
    !Array.isArray(value.hosts) || value.hosts.length < 1 || value.hosts.length > 32 || !value.hosts.every(publicHostname) ||
    new Set(value.hosts).size !== value.hosts.length || !Array.isArray(value.queryNames) || value.queryNames.length > 32 ||
    !value.queryNames.every((name) => typeof name === "string" && queryName.test(name) && !sensitiveQuery.test(name)) ||
    new Set(value.queryNames).size !== value.queryNames.length || !Array.isArray(value.contentTypes) || value.contentTypes.length < 1 ||
    !value.contentTypes.every((type) => typeof type === "string" && textTypes.includes(type)) ||
    new Set(value.contentTypes).size !== value.contentTypes.length || !positive(value.maxRequests, 6) ||
    !nonnegative(value.maxRedirects, 5) || !positive(value.maxBytes, 2_097_152) ||
    !positive(value.maxTextCharacters, 2_097_152) || value.maxTextCharacters > value.maxBytes || !positive(value.timeoutMs, 2_147_483_647)) {
    throw new Error("Invalid evidence network policy.");
  }
  return Object.freeze({ ...(value as EvidenceSourceNetworkPolicy), hosts: Object.freeze([...value.hosts]),
    queryNames: Object.freeze([...value.queryNames]), contentTypes: Object.freeze([...value.contentTypes]) });
}

function safeLinkUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 4096 || value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value) ||
    !/^https:\/\//i.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|25)/i.test(value)) return null;
  let url: URL;
  try { url = new URL(value); decodeURIComponent(url.pathname); decodeURIComponent(url.search); } catch { return null; }
  const authority = value.slice(value.indexOf("//") + 2).split(/[/?#]/, 1)[0] ?? "";
  if (url.protocol !== "https:" || url.username || url.password || authority.includes("@") || authority.includes("%") ||
    url.port && url.port !== "443" || url.hash || value.includes("#") || !publicHostname(url.hostname)) return null;
  const names = [...url.searchParams.keys()];
  if (new Set(names).size !== names.length || names.some((name) => !queryName.test(name) || sensitiveQuery.test(name)) ||
    [...url.searchParams.values()].some((part) => /[\u0000-\u001f\u007f]/.test(part))) return null;
  return url;
}
/** Structural link rules do not authorize a source, extraction rights, or server I/O. */
export function isSafeEvidenceUrl(value: unknown): boolean { return safeLinkUrl(value) !== null; }

/** Link validation is offline. Fetching additionally requires verified rights and public DNS answers. */
export function validateEvidenceSourceUrl(value: unknown, policyInput: unknown): Readonly<{ status: "valid"; url: string }> | Denied {
  let policy: EvidenceSourceNetworkPolicy;
  try { policy = parseEvidenceSourceNetworkPolicy(policyInput); } catch { return denied("invalid-policy"); }
  const url = safeLinkUrl(value);
  if (url === null) return denied("unsafe-url");
  if (!policy.hosts.includes(url.hostname)) return denied("unapproved-source");
  if ([...url.searchParams.keys()].some((name) => !policy.queryNames.includes(name))) return denied("unsafe-url");
  return Object.freeze({ status: "valid", url: url.href });
}

function ipv4Number(value: string): number {
  return value.split(".").reduce((result, octet) => result * 256 + Number(octet), 0);
}
const ipv4Blocked: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
  // Azure's platform virtual IP is globally numbered but is an internal service target.
  ["168.63.129.16", 32],
];
function ipv6Number(value: string): bigint {
  const parts = value.toLowerCase().split("::"), left = (parts[0] ?? "").split(":").filter(Boolean),
    right = (parts[1] ?? "").split(":").filter(Boolean);
  const expanded = parts.length === 1 ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return expanded.reduce((result, part) => result * 65_536n + BigInt(`0x${part}`), 0n);
}
function inIpv6(value: bigint, network: string, bits: number): boolean {
  return value >> BigInt(128 - bits) === ipv6Number(network) >> BigInt(128 - bits);
}
/** Reject special-use, transition, mapped and internal cloud targets conservatively. */
export function isPublicEvidenceAddress(value: unknown): boolean {
  if (typeof value !== "string" || value.includes("%")) return false;
  if (isIP(value) === 4) {
    const address = ipv4Number(value);
    return !ipv4Blocked.some(([network, bits]) => Math.floor(address / 2 ** (32 - bits)) === Math.floor(ipv4Number(network) / 2 ** (32 - bits)));
  }
  if (isIP(value) !== 6 || value.includes(".")) return false;
  const address = ipv6Number(value);
  return inIpv6(address, "2000::", 3) && !inIpv6(address, "2001::", 23) && !inIpv6(address, "2001:db8::", 32) &&
    !inIpv6(address, "2002::", 16) && !inIpv6(address, "3fff::", 20);
}

const resolvePublicHost = async (hostname: string): Promise<readonly EvidenceNetworkAddress[]> => {
  const values = await lookup(hostname, { all: true, verbatim: true });
  return values.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

/** The exact validated IP is used by the socket; the original host remains the TLS certificate identity. */
function pinnedHttps(request: EvidencePinnedRequest): Promise<EvidenceHttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(request.url);
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ ...request.address }]);
      else callback(null, request.address.address, request.address.family);
    };
    const outgoing = httpsRequest({ protocol: "https:", hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method: "GET", agent: false, lookup: pinnedLookup, servername: url.hostname, rejectUnauthorized: true,
      headers: request.headers, signal: request.signal, maxHeaderSize: 16_384 }, (incoming) => {
      const headers: Record<string, string | undefined> = {};
      for (const key of ["location", "content-type", "content-length", "content-encoding"]) {
        const value = incoming.headers[key];
        if (Array.isArray(value)) { incoming.destroy(); reject(new Error("Invalid source response.")); return; }
        headers[key] = value;
      }
      resolve({ statusCode: incoming.statusCode ?? 0, headers, body: incoming, close: () => { incoming.destroy(); outgoing.destroy(); } });
    });
    outgoing.on("error", () => reject(new Error("Evidence source network unavailable.")));
    outgoing.end();
  });
}

export function createEvidenceSourceFetcher(options: Readonly<{
  authorize(): void;
  verifyPolicy(policy: EvidenceSourceNetworkPolicy): boolean;
  verifyUrl(url: string, policy: EvidenceSourceNetworkPolicy): boolean;
  resolver?: (hostname: string) => Promise<readonly EvidenceNetworkAddress[]>;
  transport?: (request: EvidencePinnedRequest) => Promise<EvidenceHttpResponse>;
}>) {
  const resolver = options.resolver ?? resolvePublicHost, transport = options.transport ?? pinnedHttps;
  return Object.freeze({
    async fetch(urlInput: unknown, policyInput: unknown, context: Readonly<{ signal?: AbortSignal }> = {}): Promise<EvidenceSourceFetchResult> {
      let policy: EvidenceSourceNetworkPolicy;
      try { policy = parseEvidenceSourceNetworkPolicy(policyInput); } catch { return denied("invalid-policy"); }
      const initial = validateEvidenceSourceUrl(urlInput, policy);
      if (initial.status === "denied") return initial;
      const sourceUrl = initial.url, controller = new AbortController(), startedAt = performance.now();
      let requests = 0, timeout = false, response: EvidenceHttpResponse | null = null;
      const externalAbort = () => controller.abort();
      context.signal?.addEventListener("abort", externalAbort, { once: true });
      if (context.signal?.aborted) controller.abort();
      const timer = setTimeout(() => { timeout = true; controller.abort(); }, policy.timeoutMs);
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Evidence request stopped.")), { once: true });
      });
      // Drain even an already aborted call and every late resolver/transport rejection.
      void aborted.catch(() => {});
      function stopped(): EvidenceNetworkReason | null {
        if (timeout || performance.now() - startedAt >= policy.timeoutMs) return "timeout";
        return controller.signal.aborted ? "aborted" : null;
      }
      function approved(url: string): EvidenceNetworkReason | null {
        const stop = stopped(); if (stop !== null) return stop;
        try { if (synchronous(options.authorize()) !== undefined) return "operation-not-authorized"; } catch { return "operation-not-authorized"; }
        try { if (synchronous(options.verifyPolicy(policy)) !== true || synchronous(options.verifyUrl(url, policy)) !== true) return "unverified-policy"; }
        catch { return "unverified-policy"; }
        return stopped();
      }
      async function bounded<Value>(pending: Promise<Value>, late?: (value: Value) => void): Promise<Value> {
        const stop = stopped();
        if (stop !== null) {
          void pending.then((value) => late?.(value), () => {});
          throw new Error("Evidence request stopped.");
        }
        const guarded = pending.then((value) => {
          if (stopped() !== null) { late?.(value); throw new Error("Evidence request stopped."); }
          return value;
        });
        void guarded.catch(() => {});
        let finished = false;
        try { const value = await Promise.race([guarded, aborted]); finished = true; return value; }
        finally { if (!finished) void guarded.then((value) => late?.(value), () => {}); }
      }
      try {
        let current = sourceUrl, redirects = 0;
        const visited = new Set<string>();
        while (true) {
          const reason = approved(current); if (reason !== null) return denied(reason, requests);
          if (visited.has(current)) return denied("redirect-loop", requests);
          visited.add(current);
          if (requests >= policy.maxRequests) return denied("request-limit", requests);
          let addresses: readonly EvidenceNetworkAddress[];
          let dnsDenied: EvidenceNetworkReason | null = null;
          try {
            addresses = await bounded(Promise.resolve().then(() => {
              dnsDenied = approved(current);
              if (dnsDenied !== null) throw new Error("Evidence source resolution denied.");
              return resolver(new URL(current).hostname);
            }));
          } catch { return denied(stopped() ?? dnsDenied ?? "dns-unavailable", requests); }
          if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 64 || addresses.some((item) => !record(item) ||
            (item.family !== 4 && item.family !== 6) || typeof item.address !== "string" || isIP(item.address) !== item.family || !isPublicEvidenceAddress(item.address))) {
            return denied("unsafe-address", requests);
          }
          const beforeDispatch = approved(current); if (beforeDispatch !== null) return denied(beforeDispatch, requests);
          const address = Object.freeze({ ...addresses[0]! });
          let dispatchDenied: EvidenceNetworkReason | null = null;
          try {
            response = await bounded<EvidenceHttpResponse>(Promise.resolve().then(() => {
              // No asynchronous gap separates the final permission check from the socket operation.
              dispatchDenied = approved(current);
              if (dispatchDenied !== null) throw new Error("Evidence source request denied.");
              requests++;
              return transport(Object.freeze({ url: current, address, signal: controller.signal,
                headers: Object.freeze({ Accept: policy.contentTypes.join(", "), "Accept-Encoding": "identity", "User-Agent": "GoalHint-Evidence/1.0" }) }));
            }),
            (late) => { try { late.close(); } catch { /* Late responses have no authority or result. */ } });
          } catch { return denied(stopped() ?? dispatchDenied ?? "network-unavailable", requests); }
          if (!record(response) || !Number.isInteger(response.statusCode) || !record(response.headers) || typeof response.close !== "function" ||
            !response.body || typeof response.body[Symbol.asyncIterator] !== "function") return denied("invalid-response", requests);
          const afterDispatch = approved(current); if (afterDispatch !== null) return denied(afterDispatch, requests);
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location;
            response.close(); response = null;
            if (typeof location !== "string" || location.length > 4096 || /[\\\s\u0000-\u001f\u007f]/.test(location)) return denied("unsafe-url", requests);
            if (redirects >= policy.maxRedirects) return denied("redirect-limit", requests);
            let next: string;
            try { next = new URL(location, current).href; } catch { return denied("unsafe-url", requests); }
            // Validate raw absolute authorities before WHATWG URL normalization can erase obfuscation.
            const rawAbsolute = location.startsWith("//") ? `https:${location}` : /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(location) ? location : next;
            const validated = validateEvidenceSourceUrl(rawAbsolute, policy);
            if (validated.status === "denied") return denied(validated.reason, requests);
            current = validated.url; redirects++; continue;
          }
          if (response.statusCode !== 200) return denied("invalid-response", requests);
          const contentTypeHeader = response.headers["content-type"], encoding = response.headers["content-encoding"];
          if (typeof contentTypeHeader !== "string" || encoding !== undefined && encoding.trim().toLowerCase() !== "identity") return denied("unsupported-content", requests);
          const contentType = contentTypeHeader.split(";", 1)[0]?.trim().toLowerCase() as EvidenceSourceNetworkPolicy["contentTypes"][number];
          const charset = /(?:^|;)\s*charset\s*=\s*([^;]+)/i.exec(contentTypeHeader)?.[1]?.trim().replace(/^"|"$/g, "").toLowerCase();
          if (!policy.contentTypes.includes(contentType) || charset !== undefined && !["utf-8", "utf8", "us-ascii"].includes(charset)) return denied("unsupported-content", requests);
          const contentLength = response.headers["content-length"];
          if (contentLength !== undefined && (!/^(?:0|[1-9]\d*)$/.test(contentLength) || BigInt(contentLength) > BigInt(policy.maxBytes))) return denied("response-too-large", requests);
          const chunks: Uint8Array[] = []; let bytes = 0;
          const iterator = response.body[Symbol.asyncIterator]();
          try {
            while (true) {
              const chunk = await bounded(Promise.resolve().then(() => iterator.next()));
              const permission = approved(current); if (permission !== null) return denied(permission, requests);
              if (chunk.done) break;
              if (!(chunk.value instanceof Uint8Array)) return denied("invalid-response", requests);
              bytes += chunk.value.byteLength;
              if (bytes > policy.maxBytes) return denied("response-too-large", requests);
              chunks.push(chunk.value.slice());
            }
          } catch { return denied(stopped() ?? "network-unavailable", requests); }
          if (contentLength !== undefined && BigInt(contentLength) !== BigInt(bytes)) return denied("invalid-response", requests);
          let text: string;
          try { text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); } catch { return denied("invalid-text", requests); }
          if (text.length > policy.maxTextCharacters) return denied("response-too-large", requests);
          const finalPermission = approved(current); if (finalPermission !== null) return denied(finalPermission, requests);
          return Object.freeze({ status: "fetched", sourceUrl, finalUrl: current, text, contentType, requests, bytes });
        }
      } catch { return denied(stopped() ?? "network-unavailable", requests); }
      finally {
        clearTimeout(timer); context.signal?.removeEventListener("abort", externalAbort);
        if (response !== null) try { response.close(); } catch { /* Sanitized cleanup failure cannot expose source data. */ }
        controller.abort();
      }
    },
  });
}

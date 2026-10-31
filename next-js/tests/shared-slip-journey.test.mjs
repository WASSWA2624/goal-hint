import assert from "node:assert/strict";
import test from "node:test";
import { memberReturnPath, sharedSlipReturnPath } from "../src/domain/member-navigation.ts";
import { createMemberAuthHandler } from "../src/server/members/member-auth-http.ts";
import { shareSlipImages, prepareNativeSlipImages } from "../src/components/slips/sharing/slip-share-native.ts";

const path = `/s/${"a".repeat(32)}`;
test("shared-slip returns accept only opaque canonical paths", () => {
  assert.equal(memberReturnPath(path), path); assert.equal(sharedSlipReturnPath(path), path);
  for (const value of [null, [], "//example.test" + path, "https://goalhint.com" + path, path + "?token=secret", path + "#x", path + "/", "/s/%61" + "a".repeat(31), "/s/" + "A".repeat(32), "/s/../account", "/s/" + "a".repeat(33)]) {
    assert.equal(sharedSlipReturnPath(value), null); assert.equal(memberReturnPath(value), null);
  }
});
test("shared-slip authentication returns survive required steps without changing ordinary or administrator destinations", async () => {
  const result = { status: "authenticated", phone: "256700001101", token: "a".repeat(43) };
  const source = async () => ({ config: { production: false, cookies: { session: "owner", exclude: "exclude" } }, sessions: { verify: async () => null }, auth: {
    login: async () => result, register: async () => result, verifyAccount: async () => result, resetPassword: async () => result,
  } });
  const send = (action, target) => createMemberAuthHandler(action, source)(new Request("https://goalhint.com/api/account/" + action, { method: "POST",
    headers: { "Sec-Fetch-Site": "same-origin", Origin: "https://goalhint.com", "Content-Type": "application/json" }, body: JSON.stringify({ return: target }) }));
  for (const action of ["login", "register", "verify", "reset"]) {
    assert.equal((await (await send(action, path)).json()).next, path);
    for (const target of ["/en/slips", "//evil.test", path + "?x=1"]) assert.equal((await (await send(action, target)).json()).next, "/en");
  }
  result.requiresVerification = true;
  assert.equal((await (await send("login", path)).json()).next, "/en/account?" + new URLSearchParams({ view: "verify", return: path }));
  delete result.requiresVerification; result.requiresPasswordChange = true;
  assert.equal((await (await send("login", path)).json()).next, "/en/account?" + new URLSearchParams({ view: "new-password", return: path }));
  delete result.requiresPasswordChange; result.administrator = true;
  assert.equal((await (await send("login", path)).json()).next, "/admin/payments");
});
test("image sharing preserves activation, native payloads, cancellation and explicit fallback", async t => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"), oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => { for (const [key, value] of [["window", oldWindow], ["navigator", oldNavigator]]) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  let received;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { canShare: () => true, share: async data => { received = data; } } });
  const link = { title: "Goal Hint", text: "Slip with eligible access", url: "https://goalhint.com" + path }, files = [new File(["synthetic"], "slip.png", { type: "image/png" })];
  const operation = shareSlipImages(link, files, null);
  assert.deepEqual(received, { title: link.title, text: link.text, files }); assert.equal(await operation, "handed-off");
  navigator.share = async () => { throw new DOMException("Cancelled", "AbortError"); }; assert.equal(await shareSlipImages(link, files, null), "cancelled");
  navigator.share = async () => { throw new Error("Unavailable"); }; assert.equal(await shareSlipImages(link, files, null), "failed");
  navigator.canShare = () => false; assert.equal(await shareSlipImages(link, files, null), "unsupported");
  const encoded = [{ name: "slip.png", data: "synthetic" }];
  window.goalHintNativeShare = { version: 1, shareFiles: async data => { received = data; return "cancelled"; } };
  assert.equal(await shareSlipImages(link, files, encoded), "cancelled"); assert.deepEqual(received, { ...link, files: encoded });
  assert.equal(await shareSlipImages({ ...link, text: "x".repeat(4097) }, files, encoded), "unsupported");
  assert.equal(await prepareNativeSlipImages([]), null);
  assert.equal(await prepareNativeSlipImages([new File(["x"], "bad.svg", { type: "image/svg+xml" })]), null);
  assert.equal(await prepareNativeSlipImages(Array(33).fill(files[0])), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { consumeMemberLoginFlash, memberLoginFlashKey, saveMemberLoginFlash } from "../src/components/members/member-login-flash.ts";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test("login notices carry only the confirmed event and are consumed once after redirect", () => {
  const storage = memoryStorage();
  for (const [replaced, event] of [[false, "signed-in"], [true, "other-device-signed-out"]]) {
    assert.equal(saveMemberLoginFlash(replaced, storage), true);
    assert.deepEqual([...storage.values], [[memberLoginFlashKey, event]], "the event contains no phone, token or destination");
    assert.equal(consumeMemberLoginFlash(storage), event);
    assert.equal(consumeMemberLoginFlash(storage), null, "reloads and later navigation cannot repeat the confirmation");
  }
});

test("invalid flash data is discarded instead of displayed as a logout confirmation", () => {
  const storage = memoryStorage();
  storage.values.set(memberLoginFlashKey, "unexpected");
  assert.equal(consumeMemberLoginFlash(storage), null);
  assert.equal(storage.values.size, 0);
});

test("blocked storage drops the optional notice without throwing", () => {
  const blocked = { setItem() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(saveMemberLoginFlash(true, blocked), false);
  assert.equal(consumeMemberLoginFlash(blocked), null);
  const removalBlocked = { getItem() { return "other-device-signed-out"; }, removeItem() { throw new Error("blocked"); } };
  assert.equal(consumeMemberLoginFlash(removalBlocked), null);
});

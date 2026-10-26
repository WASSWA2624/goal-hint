import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPhone, isCanonicalPhone, localUgandaPhone, maskPhone, mobileNetworks, networkForPrefix, networkPrefixes, normalizePhone,
  outsideUgandaHint, phoneHint, phoneInputIssue, smsHref, telHref, validMobilePhone, waHref,
} from "../src/domain/phone.ts";

// Every number here is invented; none belongs to the owner or a subscriber.
const ugandan = "256772123456";

test("phone input validation agrees with normalization, distinguishes empty optional fields, and bounds pastes", () => {
  assert.equal(phoneInputIssue(""), null);
  assert.equal(phoneInputIssue("   ", true), "required");
  for (const value of ["0772 123 456", "+256 (772) 123-456", "2560772123456", "0044 7946 001234", "+254 712 345 678", "+1 415 555 0123"]) {
    assert.equal(phoneInputIssue(value, true), null, value);
    assert.ok(validMobilePhone(value));
  }
  for (const value of ["256", "07", "077212345", "07721234567", "abc", "+256772123456 ext 1"]) {
    assert.equal(phoneInputIssue(value, true), "invalid", value);
    assert.equal(normalizePhone(value), null);
  }
  assert.equal(phoneInputIssue("256254712345678"), "country-code");
  assert.equal(phoneInputIssue("1234567890123456"), "too-long");
  assert.equal(phoneInputIssue("x".repeat(65)), "too-long");
});

test("a new number must be a mobile number for its country; a lookup still accepts any stored canonical number", () => {
  // Canonical, but too short or long for Kenya, a landline, or no country at all.
  for (const value of ["25471234567", "2547123456789", "254202012345", "123456789012345", "447700900123", "80012345678", "883510012345"]) {
    assert.ok(normalizePhone(value), value);
    assert.equal(validMobilePhone(value), null, value);
    assert.equal(phoneInputIssue(value, true), "not-mobile", value);
    assert.equal(phoneInputIssue(value, true, true), null, value);
  }
  for (const [input, phone] of [["0772123456", ugandan], ["+254 712 345 678", "254712345678"], ["255712345678", "255712345678"],
    ["+250 788 123 456", "250788123456"], ["+211 912 345 678", "211912345678"], ["+44 7946 001234", "447946001234"]]) {
    assert.equal(validMobilePhone(input), phone, input);
  }
  for (const value of [undefined, null, 256772123456, "", "0772 123 45"]) assert.equal(validMobilePhone(value), null, String(value));
});

test("every input in the plan's phone table normalizes or is refused as listed (section 9)", () => {
  for (const input of ["0772123456", "772123456", "+256772123456", "00256772123456", "256 772-123 456", "2560772123456",
    "256256772123456", "256+256772123456", "25600256772123456", "256 0772 123 456"]) {
    assert.equal(normalizePhone(input), ugandan, input);
    assert.equal(phoneHint(input), null, input);
  }
  for (const input of ["254712345678", "256+254712345678", "25600254712345678"]) {
    assert.equal(normalizePhone(input), "254712345678", input);
  }
  assert.equal(normalizePhone("256254712345678"), null);
  assert.equal(phoneHint("256254712345678"), "outside-uganda");
  assert.match(outsideUgandaHint, /^For a number outside Uganda, delete 256 and type the full number with its country code$/u);
  for (const input of ["25677212345", "256672123456", "0201234567", "012345678901"]) {
    assert.equal(normalizePhone(input), null, input);
  }
});

test("typing after the 256 prefill shows the outside-Uganda hint only for a digit other than 7 or 0", () => {
  // Live typing: the hint appears as soon as the fourth digit rules out a Ugandan mobile number.
  for (const input of ["2561", "2562", "2563", "2564", "2565", "2566", "2568", "2569", "256 4471 234"]) assert.equal(phoneHint(input), "outside-uganda", input);
  // `0201234567` becomes 256201234567 only in step 4, so a local landline-shaped entry gets no misleading hint.
  for (const input of ["", "256", "2567", "25607", "256+", "2560201234567", "0201234567", "25677212345", "4479460012345"]) {
    assert.equal(phoneHint(input), null, input);
  }
});

test("separators, prefixes and lengths follow the five normalization steps", () => {
  for (const [input, expected] of [
    ["(0772) 123.456", ugandan], ["0772\u2011123\u2013456", ugandan], ["\u00a0772 123 456\t", ugandan], ["[0772]123456", ugandan],
    ["+44 7946 001234", "447946001234"], ["0044 7946 001234", "447946001234"], ["1415555012", "1415555012"],
    ["123456789012345", "123456789012345"],
    // Only one leading + or 00 is dropped, and only one prefill repetition is removed.
    ["+00256772123456", null], ["0000256772123456", null], ["256256256772123456", null],
    ["1234567890123456", null], ["123456789", null], ["672123456", null], ["0772 123 45", null], ["07721234567", null],
    ["256772 123 456 ext 1", null], ["\uff12\uff15\uff16\uff17\uff17\uff12\uff11\uff12\uff13\uff14\uff15\uff16", null], ["256*772#123", null],
    [null, null], [undefined, null], [256772123456, null], [{}, null], ["7".repeat(65), null],
  ]) {
    assert.equal(normalizePhone(input), expected, String(input));
  }
});

test("canonical digits are recognized without normalizing", () => {
  for (const value of [ugandan, "254712345678", "1415555012", "123456789012345"]) assert.equal(isCanonicalPhone(value), true, value);
  for (const value of ["0772123456", "+256772123456", "256 772 123 456", "25677212345", "256672123456", "123456789", "1234567890123456",
    "", null, 256772123456]) assert.equal(isCanonicalPhone(value), false, String(value));
  // Normalizing a canonical number is the identity.
  for (const value of [ugandan, "254712345678", "447946001234"]) assert.equal(normalizePhone(value), value);
});

test("display, mask and local forms", () => {
  assert.equal(formatPhone(ugandan), "256 772 123 456");
  assert.equal(formatPhone("254712345678"), "254 712 345 678");
  assert.equal(formatPhone("1415555012"), "141 555 501 2");
  assert.equal(formatPhone("not a number"), "not a number");
  assert.equal(maskPhone(ugandan), "ending 456");
  assert.equal(maskPhone("447946001234"), "ending 234");
  assert.equal(localUgandaPhone(ugandan), "0772123456");
  assert.equal(localUgandaPhone("254712345678"), "254712345678");
});

test("tel, WhatsApp and SMS links carry the plus only inside the link and round-trip a code message", () => {
  assert.equal(telHref(ugandan), "tel:+256772123456");
  assert.equal(waHref(ugandan), "https://wa.me/256772123456");
  assert.equal(smsHref(ugandan), "sms:+256772123456");
  const message = "Goal Hint code: ABCD-EFGH-JKMN\nTap to unlock: https://goalhint.com/en/account#code=ABCD-EFGH-JKMN\n"
    + "Weekly: access until Sun 1 Nov, 21:00 EAT & more. Works only on your Goal Hint number ending 456. 100% = +1?";
  const wa = new URL(waHref(ugandan, message));
  assert.equal(wa.origin, "https://wa.me");
  assert.equal(wa.pathname, "/256772123456");
  assert.equal(wa.searchParams.get("text"), message);
  assert.deepEqual([...wa.searchParams.keys()], ["text"]);
  assert.equal(wa.hash, "", "the #code= fragment stays inside the encoded text");
  const sms = new URL(smsHref(ugandan, message));
  assert.equal(sms.protocol, "sms:");
  assert.equal(sms.pathname, "+256772123456");
  assert.equal(sms.searchParams.get("body"), message);
  assert.equal(sms.hash, "");
  for (const href of [waHref(ugandan, message), smsHref(ugandan, message)]) {
    assert.doesNotMatch(href, /[\s#&](?!body=)/u, href);
  }
});

test("network prefixes stay empty until the owner confirms them, and an injected table decides by the longest prefix", () => {
  assert.deepEqual(mobileNetworks, ["mtn", "airtel"]);
  assert.deepEqual(networkPrefixes, { mtn: [], airtel: [] });
  assert.ok(Object.isFrozen(networkPrefixes) && Object.isFrozen(networkPrefixes.mtn) && Object.isFrozen(networkPrefixes.airtel));
  for (const value of [ugandan, "256700000001", "256750000001", "254712345678"]) assert.equal(networkForPrefix(value), null, value);
  // An obviously fake table: real prefixes are an owner input (OP-38).
  const table = { mtn: ["25671", "2567123"], airtel: ["25672", "256712"] };
  assert.equal(networkForPrefix("256711000001", table), "mtn");
  assert.equal(networkForPrefix("256712000001", table), "airtel", "a longer prefix wins");
  assert.equal(networkForPrefix("256712300001", table), "mtn", "the longest prefix wins");
  assert.equal(networkForPrefix("256720000001", table), "airtel");
  assert.equal(networkForPrefix("256730000001", table), null);
  assert.equal(networkForPrefix("254712345678", table), null);
  // Both networks claiming the same prefix is ambiguous until a longer prefix decides it.
  const tied = { mtn: ["25679", "25679"], airtel: ["25679", "2567999"] };
  assert.equal(networkForPrefix("256790000001", tied), null);
  assert.equal(networkForPrefix("256799900001", tied), "airtel");
  assert.equal(networkForPrefix("256790000001", { mtn: ["25679", "25679"], airtel: [] }), "mtn");
  assert.equal(networkForPrefix("256790000001", { mtn: ["2567x", ""], airtel: [] }), null, "malformed entries never match");
});

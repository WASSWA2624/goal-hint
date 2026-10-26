import assert from "node:assert/strict";
import test from "node:test";
import { parseVerificationCode } from "../src/domain/verification-code.ts";

test("verification code entry accepts exactly six ASCII digits and preserves leading zeros", () => {
  for (const [input, expected] of [["123456", "123456"], ["000001", "000001"], ["000000", "000000"],
    [" 123456 ", "123456"], ["\t019732\r\n", "019732"], ["\u00a0123456\u00a0", "123456"],
    [" ".repeat(26) + "123456", "123456"]]) assert.equal(parseVerificationCode(input), expected, JSON.stringify(input));
});

test("verification code paste refuses message text, separators, extra digits and non-ASCII numbers", () => {
  for (const input of ["", "   ", "12345", "1234567", "Code: 123456", "Your Goal Hint code is 123456.", "123 456", "123-456",
    "123\t456", "123\n456", "123456 789012", "+123456", "1.23456", "１２３４５６", "١٢٣٤٥٦", "12345a", "123456\0",
    " ".repeat(27) + "123456", "x".repeat(1000)]) assert.equal(parseVerificationCode(input), null, JSON.stringify(input));
});

test("verification code parsing never coerces non-string values or collections", () => {
  let conversions = 0;
  for (const input of [null, undefined, 123456, 123456n, true, ["123456"], Object("123456"),
    { toString() { conversions++; return "123456"; } }]) assert.equal(parseVerificationCode(input), null);
  assert.equal(conversions, 0);
});

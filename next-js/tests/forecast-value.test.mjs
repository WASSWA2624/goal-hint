import assert from "node:assert/strict";
import test from "node:test";
import { forecastExpectedReturn } from "../src/domain/forecast-value.ts";

test("positive forecast value uses the original probability and exact bookmaker decimal", () => {
  assert.ok(forecastExpectedReturn(0.7, "1.4286") > 0);
  assert.ok(forecastExpectedReturn(0.7, "1.4285") < 0);
  assert.equal(forecastExpectedReturn(0.8, "1.25"), 0);
  assert.ok(Math.abs(forecastExpectedReturn(0.3, "4.0") - 0.2) < 1e-12);
});

test("unknown or invalid prices and probabilities cannot establish value", () => {
  for (const price of [null, "", "1.00", "2e2", "-2", "2.22222"])
    assert.equal(forecastExpectedReturn(0.8, price), null);
  for (const probability of [-0.01, 1.01, Infinity, NaN])
    assert.equal(forecastExpectedReturn(probability, "2.00"), null);
  assert.equal(forecastExpectedReturn(0, "2.00"), -1);
});

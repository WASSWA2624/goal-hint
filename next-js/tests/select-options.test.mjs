import assert from "node:assert/strict";
import test from "node:test";
import { indexSelectOptions } from "../src/domain/select-options.ts";

test("option indexes retain input order, original objects and first-match identity", () => {
  const options = Object.freeze([
    Object.freeze({ value: "uganda", label: "Uganda", detail: "East Africa" }),
    Object.freeze({ value: "kenya", label: "Kenya" }),
    Object.freeze({ value: "uganda", label: "Duplicate" }),
    Object.freeze({ value: "", label: "All" }),
  ]);
  const index = indexSelectOptions(options);
  assert.deepEqual([...index.keys()], ["uganda", "kenya", ""]);
  for (const value of ["uganda", "kenya", "", "unknown"]) {
    assert.equal(index.get(value)?.option, options.find(option => option.value === value));
    assert.equal(index.get(value)?.index ?? -1, options.findIndex(option => option.value === value));
  }
  assert.equal(index.get("uganda").option.detail, "East Africa");
  assert.equal(indexSelectOptions([]).size, 0);
});

test("large pickers index once rather than scanning the collection for every option ID", () => {
  let reads = 0;
  const count = 2_000;
  const options = Object.freeze(Array.from({ length: count }, (_, number) => Object.freeze({
    get value() { reads++; return `league-${number}`; }, label: `League ${number}`,
  })));
  const indexed = indexSelectOptions(options);
  for (let number = 0; number < count; number++) {
    assert.equal(indexed.get(`league-${number}`).index, number);
  }
  assert.equal(reads, count, "one value read per option builds the shared index");
  const beforeHover = reads;
  for (let hover = 0; hover < 20; hover++) for (let number = 0; number < count; number++) {
    assert.equal(indexed.get(`league-${number}`).index, number);
  }
  assert.equal(reads, beforeHover, "focus changes reuse the existing option index");
});

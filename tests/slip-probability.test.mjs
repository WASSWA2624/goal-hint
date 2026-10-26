import assert from 'node:assert/strict';
import test from 'node:test';
import { independentSlipProbability } from '../src/domain/slip-probability.ts';

const selections = probabilities => probabilities.map(probability => ({ probability }));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Number.EPSILON,
  `Expected ${actual} to equal ${expected} within floating-point precision.`);

test('combined slip chance multiplies the selected match probabilities', () => {
  closeTo(independentSlipProbability(selections([0.8, 0.7, 0.6])), 0.336);
});

test('one selected match retains its chance, zero forces zero, and certain legs stay certain', () => {
  for (const probability of [0, 0.123456789, 0.8, 1]) {
    assert.equal(independentSlipProbability(selections([probability])), probability);
  }
  for (const probabilities of [[0, 0.8], [0.8, 0], [1, 1, 0]]) {
    assert.equal(independentSlipProbability(selections(probabilities)), 0);
  }
  assert.equal(independentSlipProbability(selections([1, 1, 1])), 1);
});

test('the estimate uses original fractional precision rather than rounded display percentages', () => {
  const actual = independentSlipProbability(selections([0.8149, 0.7291, 0.6039]));
  closeTo(actual, 8149 * 7291 * 6039 / 1e12);
  assert.ok(Math.abs(actual - 0.81 * 0.73 * 0.60) > 0.001);
});

test('selection order preserves the estimate and frozen source selections stay unchanged', () => {
  const source = Object.freeze(selections([0.8149, 0.7291, 0.6039]).map(Object.freeze));
  const original = structuredClone(source);
  closeTo(independentSlipProbability(source), independentSlipProbability([...source].reverse()));
  assert.deepEqual(source, original);
});

test('empty or invalid selections have no estimate, even after a zero-probability leg', () => {
  assert.equal(independentSlipProbability([]), null);
  for (const probability of [NaN, Infinity, -Infinity, -0.01, 1.01, undefined, null, '0.8']) {
    assert.equal(independentSlipProbability(selections([probability])), null);
    assert.equal(independentSlipProbability(selections([0, probability])), null);
  }
  assert.equal(independentSlipProbability([null]), null);
  assert.equal(independentSlipProbability([{}]), null);
});

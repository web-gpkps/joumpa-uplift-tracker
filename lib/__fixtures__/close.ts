import { expect } from 'bun:test';

/**
 * Deep comparison where numbers only need to agree to `digits` decimals (Excel and JS sum
 * floats in the same order, but averages are compared with a tolerance anyway).
 * Only the keys present in `expected` are checked.
 */
export function expectClose(actual: unknown, expected: unknown, digits = 9, path = '$'): void {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number') throw new Error(`${path}: expected number ${expected}, got ${JSON.stringify(actual)}`);
    if (Math.abs(actual - expected) > 10 ** -digits) {
      throw new Error(`${path}: expected ${expected}, got ${actual}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) throw new Error(`${path}: expected an array, got ${JSON.stringify(actual)}`);
    expect(actual.length).toBe(expected.length);
    expected.forEach((e, i) => expectClose(actual[i], e, digits, `${path}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object') throw new Error(`${path}: expected an object, got ${JSON.stringify(actual)}`);
    for (const [k, v] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[k], v, digits, `${path}.${k}`);
    }
    return;
  }
  if (actual !== expected) throw new Error(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Builds row objects from a header and value tuples: rows(['key','a'], ['SUB', 1]). */
export function rows<K extends string>(header: readonly K[], ...data: unknown[][]): Array<Record<K, unknown>> {
  return data.map((values) => {
    if (values.length !== header.length) throw new Error(`row ${JSON.stringify(values)} has ${values.length} values, header has ${header.length}`);
    return Object.fromEntries(header.map((h, i) => [h, values[i]])) as Record<K, unknown>;
  });
}

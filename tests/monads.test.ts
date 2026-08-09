import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OlMonadSet,
  decodeCompactMonadSet,
  encodeCompactMonadSet,
  num2string,
} from "../src/lib/corpus/monads.ts";

test("num2string: base-64 big-endian de Emdros", () => {
  assert.equal(num2string(1), "1");
  assert.equal(num2string(59), "k");
  assert.equal(num2string(60), "l");
  assert.equal(num2string(63), "o");
  assert.equal(num2string(64), "10");
  assert.equal(num2string(392900), "1Ok4");

  const m = 392900;
  assert.ok(!num2string(m).includes("y") && !num2string(m).includes("z"));
});

test("decodeCompactMonadSet: '1z:' → Gn 1:1 (monads 1-11)", () => {
  assert.deepEqual(decodeCompactMonadSet("1z:"), [{ low: 1, high: 11 }]);
});

test("encode/decode roundtrip (incluido el monad máximo de ETCBC4)", () => {
  const segments = [
    { low: 1, high: 60 },
    { low: 392900, high: 392900 },
    { low: 1000, high: 1030 },
  ];
  assert.deepEqual(decodeCompactMonadSet(encodeCompactMonadSet(segments)), segments);
});

test("str2MonadSet: '{ 1, 4-8, 13 }' y '{{42}}'", () => {
  const ms = OlMonadSet.str2MonadSet("{ 1, 4-8, 13 }");
  assert.deepEqual(ms.toJSON(), { segments: [{ low: 1, high: 1 }, { low: 4, high: 8 }, { low: 13, high: 13 }] });
  assert.equal(ms.size(), 7); // 1 + (4..8=5) + 1
  assert.equal(OlMonadSet.str2MonadSet("{{42}}").getSingleInteger(), 42);
});

test("containsMonad / containsMonadSet / overlaps", () => {
  const a = new OlMonadSet([{ low: 1, high: 10 }, { low: 20, high: 30 }]);
  assert.ok(a.containsMonad(5));
  assert.ok(!a.containsMonad(15));
  assert.ok(a.containsMonadSet(new OlMonadSet([{ low: 2, high: 4 }, { low: 25, high: 26 }])));
  assert.ok(!a.containsMonadSet(new OlMonadSet([{ low: 2, high: 15 }])));
  assert.ok(a.overlaps(new OlMonadSet([{ low: 15, high: 22 }])));
  assert.ok(!a.overlaps(new OlMonadSet([{ low: 12, high: 19 }])));
});

test("addSet consolida (fusiona adyacentes/solapados)", () => {
  const a = new OlMonadSet();
  a.addSet(new OlMonadSet([{ low: 5, high: 10 }]));
  a.addSet(new OlMonadSet([{ low: 1, high: 4 }]));
  assert.deepEqual(a.toJSON(), { segments: [{ low: 1, high: 10 }] });
  a.addSet(new OlMonadSet([{ low: 11, high: 13 }]));
  assert.deepEqual(a.toJSON(), { segments: [{ low: 1, high: 13 }] });
});

test("addSetNoConsolidate no fusiona", () => {
  const a = new OlMonadSet();
  a.addSetNoConsolidate(new OlMonadSet([{ low: 1, high: 5 }]));
  a.addSetNoConsolidate(new OlMonadSet([{ low: 2, high: 3 }]));
  assert.equal(a.segments.length, 2);
});

test("high2() es el último monad; low() el primero", () => {
  const ms = new OlMonadSet([{ low: 4, high: 8 }, { low: 13, high: 13 }]);
  assert.equal(ms.low(), 4);
  assert.equal(ms.high1(), 8);
  assert.equal(ms.high2(), 13);
});

test("iterador y toArray en orden ascendente", () => {
  const ms = new OlMonadSet([{ low: 4, high: 6 }]);
  assert.deepEqual(ms.toArray(), [4, 5, 6]);
  assert.deepEqual([...ms], [4, 5, 6]);
});

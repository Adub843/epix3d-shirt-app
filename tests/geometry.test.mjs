import { test } from "node:test";
import assert from "node:assert/strict";
import * as g from "../geometry.js";

const every = () => g.STYLES.flatMap(([style]) => g.SHAPES.map(([shape]) => ({ style, shape, palette: "neon", density: 6, seed: 42 })));

test("every style and shape makes a well-formed SVG", () => {
  for (const o of every()) {
    const svg = g.generate(o);
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1000 1000" width="1000" height="1000">/);
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(svg.length > 400, `${o.style}/${o.shape} is nearly empty`);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${o.style}/${o.shape} has a bad number`);
    const open = (svg.match(/<(svg|g|defs|clipPath)\b/g) ?? []).length, close = (svg.match(/<\/(svg|g|defs|clipPath)>/g) ?? []).length;
    assert.equal(open, close, `${o.style}/${o.shape} has unbalanced tags`);
  }
});

test("same settings give the same art, a new seed gives new art", () => {
  const o = { style: "hex", palette: "street", shape: "circle", density: 7, seed: 99 };
  assert.equal(g.generate(o), g.generate({ ...o }));
  assert.notEqual(g.generate(o), g.generate({ ...o, seed: 100 }));
});

test("only palette colors are used, all solid", () => {
  for (const p of g.PALETTES) {
    const svg = g.generate({ style: "tri", palette: p.id, shape: "none", density: 8, seed: 7 });
    const used = new Set(svg.match(/#[0-9a-f]{6}/gi).map((c) => c.toLowerCase()));
    for (const c of used) assert.ok(p.colors.includes(c), `${p.id} used ${c}`);
    assert.doesNotMatch(svg, /opacity/);
  }
});

test("strokes are thick enough for DTF at a 10 inch print", () => {
  for (let d = 3; d <= 12; d++) {
    const svg = g.generate({ style: "truchet", palette: "acid", shape: "none", density: d, seed: d });
    for (const w of svg.match(/stroke-width="([\d.]+)"/g).map((m) => Number(m.match(/[\d.]+/)[0]))) assert.ok(w >= 16, `stroke ${w} at density ${d}`);
  }
});

test("design codes round-trip and bad input is cleaned up", () => {
  const o = g.normalize({ style: "cubes", palette: "ink", shape: "shield", density: 11, seed: 0xabcdef });
  assert.deepEqual(g.fromCode(g.codeOf(o)), o);
  assert.equal(g.fromCode("nonsense"), null);
  assert.deepEqual(g.normalize({ style: "nope", palette: "nope", shape: "nope", density: 99, seed: -1 }),
    { style: g.STYLES[0][0], palette: g.PALETTES[0].id, shape: g.SHAPES[0][0], density: 12, seed: 4294967295 });
  const r = g.randomize(g.rng(1));
  assert.deepEqual(g.normalize(r), r);
});

test("clip ids differ between designs", () => {
  const a = g.generate({ style: "hex", shape: "circle", seed: 1 }), b = g.generate({ style: "hex", shape: "circle", seed: 2 });
  assert.notEqual(a.match(/clipPath id="([^"]+)"/)[1], b.match(/clipPath id="([^"]+)"/)[1]);
});

test("default palette suits the shirt", () => {
  assert.equal(g.PALETTES.find((p) => p.id === g.defaultPalette(true)).on, "dark");
  assert.notEqual(g.PALETTES.find((p) => p.id === g.defaultPalette(false)).on, "dark");
});

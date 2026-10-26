import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMPLATES, colorsFor } from "../templates.js";
import { SHAPES } from "../design.js";
import * as g from "../geometry.js";

const fonts = new Set(JSON.parse(readFileSync(new URL("../fonts/fonts.json", import.meta.url))).fonts.map((f) => f.name));
const icons = new Set(JSON.parse(readFileSync(new URL("../art/icons.json", import.meta.url))).icons.map((i) => i.n));
const shapes = new Set(SHAPES.map((s) => s.id));

test("every idea uses fonts, art, shapes and patterns that exist", () => {
  assert.ok(TEMPLATES.length >= 20);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, TEMPLATES.length, "ids are unique");
  for (const dark of [true, false]) for (const tpl of TEMPLATES) {
    const layers = tpl.build(colorsFor(dark, tpl.accent));
    assert.ok(layers.length, tpl.id);
    for (const l of layers) {
      if (l.t === "text") assert.ok(fonts.has(l.font), `${tpl.id}: font ${l.font}`);
      if (l.t === "icon") assert.ok(icons.has(l.id), `${tpl.id}: icon ${l.id}`);
      if (l.t === "shape") assert.ok(shapes.has(l.id), `${tpl.id}: shape ${l.id}`);
      if (l.t === "pattern") {
        assert.equal(tpl.needs, "pattern", `${tpl.id} must say it needs the pattern maker`);
        const o = g.normalize(l);
        for (const k of ["style", "palette", "shape"]) assert.equal(o[k], l[k], `${tpl.id}: pattern ${k} ${l[k]}`);
      }
      assert.ok(l.x - l.w / 2 >= -0.01 && l.x + l.w / 2 <= 12.01, `${tpl.id}: ${l.t} fits the width`);
      assert.ok(l.y > 0 && l.y < 16, `${tpl.id}: ${l.t} sits in the print area`);
      for (const k of ["color", "fill", "outline", "outline2", "shadow", "grad"]) if (l[k]) assert.match(l[k], /^#[0-9a-f]{6}$/i, `${tpl.id}: ${k}`);
    }
  }
});

test("ink contrasts with the shirt", () => {
  assert.equal(colorsFor(true).ink, "#ffffff");
  assert.equal(colorsFor(false).ink, "#111111");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as im from "../imaging.js";

const make = (w, h, fn) => {
  const img = im.blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(fn(x, y), (y * w + x) * 4);
  return img;
};
const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];
const px = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const solidFrac = (img, x0, y0, x1, y1) => {
  let n = 0, s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (alphaAt(img, x, y) === 255) s++; }
  return s / n;
};

// 2x2-pixel red dots on a 4px grid, plus a few semi-transparent pixels.
const halftone = () => make(40, 40, (x, y) => ((x >> 1) + (y >> 1)) % 2 === 0 ? [200, 30, 30, 255] : [0, 0, 0, 0]);

test("descreen fills a halftone dot pattern into solid color", () => {
  const out = im.descreen(halftone(), { strength: 2 });
  assert.ok(solidFrac(out, 0, 0, 40, 40) > 0.9, `solid ${solidFrac(out, 0, 0, 40, 40)}`);
  const [r, g, b] = px(out, 20, 20);
  assert.ok(r > 150 && g < 80 && b < 80, `color ${r},${g},${b}`);
});

test("descreen leaves fully transparent areas transparent", () => {
  const img = make(60, 20, (x, y) => x < 20 && ((x >> 1) + (y >> 1)) % 2 === 0 ? [0, 0, 255, 255] : [0, 0, 0, 0]);
  const out = im.descreen(img, { strength: 2 });
  assert.equal(solidFrac(out, 35, 0, 60, 20), 0);
});

test("removeSemiTransparent leaves only 0 or 255 alpha", () => {
  const img = make(16, 16, (x, y) => [10, 10, 10, (x * 16 + y) % 256]);
  const out = im.removeSemiTransparent(img, 128);
  for (let i = 3; i < out.data.length; i += 4) assert.ok(out.data[i] === 0 || out.data[i] === 255);
  assert.equal(alphaAt(out, 7, 15), 0);   // 127
  assert.equal(alphaAt(out, 8, 0), 255);  // 128
});

test("chokeAlpha shrinks a square by exactly px per side, dilate grows it", () => {
  const sq = make(30, 30, (x, y) => x >= 10 && x < 20 && y >= 10 && y < 20 ? [0, 0, 0, 255] : [0, 0, 0, 0]);
  const bbox = (img) => { const t = im.trimTransparent(img); return [t.x, t.y, t.image.width, t.image.height]; };
  assert.deepEqual(bbox(im.chokeAlpha(sq, 1)), [11, 11, 8, 8]);
  assert.deepEqual(bbox(im.chokeAlpha(sq, 2)), [12, 12, 6, 6]);
  assert.deepEqual(bbox(im.dilateAlpha(sq, 2)), [8, 8, 14, 14]);
});

test("removeBackground flood fill keeps an enclosed white hole", () => {
  // white page, black ring, white inside the ring
  const img = make(30, 30, (x, y) => {
    const ring = x >= 8 && x < 22 && y >= 8 && y < 22 && !(x >= 11 && x < 19 && y >= 11 && y < 19);
    return ring ? [0, 0, 0, 255] : [255, 255, 255, 255];
  });
  const out = im.removeBackground(img, { tolerance: 30, contiguous: true, feather: 0 });
  assert.equal(alphaAt(out, 0, 0), 0);
  assert.equal(alphaAt(out, 15, 15), 255);
  assert.equal(alphaAt(out, 9, 9), 255);
  const global = im.removeBackground(img, { contiguous: false, feather: 0 });
  assert.equal(alphaAt(global, 15, 15), 0);
});

test("removeBackground auto-detects a colored edge", () => {
  const img = make(20, 20, (x, y) => x > 5 && x < 15 && y > 5 && y < 15 ? [255, 255, 0, 255] : [0, 128, 0, 255]);
  const out = im.removeBackground(img, { feather: 0 });
  assert.equal(alphaAt(out, 1, 1), 0);
  assert.equal(alphaAt(out, 10, 10), 255);
});

test("dtfPrep removes semi-transparency, knocks out shirt color and chokes", () => {
  const img = make(20, 20, (x, y) => {
    if (x < 3) return [0, 0, 0, 90];            // faint shadow
    if (x >= 15) return [20, 30, 60, 255];       // navy, same as shirt
    return [250, 250, 250, 255];
  });
  const { image, report } = im.dtfPrep(img, { knockout: [20, 30, 60], choke: 1 });
  assert.equal(report.removedSemi, 60);
  assert.equal(alphaAt(image, 1, 10), 0);
  assert.equal(alphaAt(image, 17, 10), 0);
  assert.equal(alphaAt(image, 9, 10), 255);
  assert.equal(alphaAt(image, 3, 10), 0); // choked edge
});

test("thinLineReport flags 1px lines but not thick blocks", () => {
  const img = make(30, 30, (x, y) => x === 5 || (x >= 15 && x < 25 && y >= 5 && y < 25) ? [0, 0, 0, 255] : [0, 0, 0, 0]);
  const r = im.thinLineReport(img, 4);
  assert.equal(r.thinPixels, 30);
  assert.equal(r.totalPixels, 230);
});

test("adjust, invert, grayscale, recolor, replaceColor", () => {
  const img = make(2, 1, (x) => x ? [200, 100, 50, 255] : [0, 0, 0, 0]);
  assert.deepEqual(px(im.invert(img), 1, 0), [55, 155, 205, 255]);
  const g = px(im.grayscale(img), 1, 0);
  assert.ok(g[0] === g[1] && g[1] === g[2]);
  assert.deepEqual(px(im.recolorSolid(img, [1, 2, 3]), 1, 0), [1, 2, 3, 255]);
  assert.deepEqual(px(im.recolorSolid(img, [1, 2, 3]), 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(px(im.adjust(img, {}), 1, 0), [200, 100, 50, 255]);
  assert.ok(px(im.adjust(img, { brightness: 50 }), 1, 0)[0] > 200);
  const hue = px(im.adjust(img, { hue: 120 }), 1, 0);
  assert.ok(hue[1] > hue[0], `hue ${hue}`);
  assert.deepEqual(px(im.replaceColor(img, [200, 100, 50], [0, 0, 255], 10), 1, 0), [0, 0, 255, 255]);
});

test("autoLevels stretches a dull image", () => {
  const img = make(10, 1, (x) => [100 + x * 5, 100 + x * 5, 100 + x * 5, 255]);
  const out = im.autoLevels(img, 0);
  assert.equal(px(out, 0, 0)[0], 0);
  assert.equal(px(out, 9, 0)[0], 255);
});

test("quantize maps to at most N colors", () => {
  const img = make(20, 20, (x, y) => [x * 12, y * 12, 100, 255]);
  const { image, palette } = im.quantize(img, 4);
  assert.equal(palette.length, 4);
  const seen = new Set();
  for (let i = 0; i < image.data.length; i += 4) seen.add(image.data.slice(i, i + 3).join());
  assert.ok(seen.size <= 4);
});

test("denoise removes a single speck", () => {
  const img = make(5, 5, (x, y) => x === 2 && y === 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]);
  assert.deepEqual(px(im.denoise(img, 1), 2, 2), [0, 0, 0, 255]);
});

test("resize and upscale keep size, color and transparency", () => {
  const img = make(10, 10, (x) => x < 5 ? [255, 0, 0, 255] : [0, 0, 0, 0]);
  const big = im.upscale(img, 2);
  assert.equal(big.width, 20);
  assert.equal(big.height, 20);
  assert.deepEqual(px(big, 2, 10), [255, 0, 0, 255]);
  assert.equal(alphaAt(big, 18, 10), 0);
  const small = im.resize(img, 5, 5);
  assert.equal(small.width, 5);
  assert.equal(px(small, 0, 2)[0], 255);
});

test("trimTransparent crops to content", () => {
  const img = make(10, 10, (x, y) => x >= 2 && x < 5 && y >= 3 && y < 9 ? [0, 0, 0, 255] : [0, 0, 0, 0]);
  const t = im.trimTransparent(img);
  assert.deepEqual([t.x, t.y, t.image.width, t.image.height], [2, 3, 3, 6]);
});

test("printStats thresholds", () => {
  assert.equal(im.printStats(3000, 3000, 10, 10).level, "good");
  assert.equal(im.printStats(2999, 3000, 10, 10).level, "ok");
  assert.equal(im.printStats(1500, 3000, 10, 10).level, "ok");
  assert.equal(im.printStats(1499, 3000, 10, 10).level, "low");
  assert.equal(im.printStats(1000, 600, 4, 2).dpi, 250);
});

test("price rounds up to the next .99 and validates", () => {
  assert.equal(im.price({ cost: 3.5, margin: 1, printFee: 8 }), 15.99);   // 15.00
  assert.equal(im.price({ cost: 3.62, margin: 1, printFee: 8 }), 15.99);  // 15.24
  assert.equal(im.price({ cost: 4, margin: 0.5, printFee: 6, upcharge: 2 }), 14.99); // 14.00
  assert.equal(im.price({ cost: 5, margin: 1, printFee: 9.99 }), 19.99);  // 19.99 stays
  assert.throws(() => im.price({ cost: -1, margin: 1, printFee: 8 }));
  assert.throws(() => im.price({ cost: NaN, margin: 1, printFee: 8 }));
  assert.throws(() => im.price({ cost: 3, margin: "1", printFee: 8 }));
});

test("no function mutates its input", () => {
  const img = halftone();
  const before = new Uint8ClampedArray(img.data);
  for (const run of [
    () => im.descreen(img), () => im.adjust(img, { contrast: 40, saturation: 30, hue: 50 }), () => im.invert(img),
    () => im.grayscale(img), () => im.autoLevels(img), () => im.recolorSolid(img, [1, 1, 1]),
    () => im.replaceColor(img, [200, 30, 30], [0, 0, 0]), () => im.removeBackground(img),
    () => im.removeSemiTransparent(img), () => im.chokeAlpha(img, 2), () => im.dilateAlpha(img, 2),
    () => im.quantize(img, 3), () => im.unsharp(img), () => im.denoise(img), () => im.upscale(img, 2),
    () => im.trimTransparent(img), () => im.thinLineReport(img, 4), () => im.dtfPrep(img, { knockout: [0, 0, 0] }),
    () => im.pad(img, 3), () => im.duotone(img, [0, 0, 0], [255, 255, 255]), () => im.stencil(img), () => im.pixelate(img, 10),
    () => im.halftone(img, { cellPct: 10 }), () => im.distress(img), () => im.outline(img), () => im.dropShadow(img), () => im.maskShape(img, "star"),
  ]) { run(); assert.deepEqual(img.data, before); }
});

test("descreen on 2000x2000 runs within budget", () => {
  const img = make(2000, 2000, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? [20, 90, 200, 255] : [0, 0, 0, 0]);
  const t = performance.now();
  const out = im.descreen(img, { strength: 3 });
  const ms = performance.now() - t;
  assert.equal(out.width, 2000);
  assert.ok(ms < 2500, `took ${ms.toFixed(0)} ms`);
});

// ---------- style effects ----------
const opaqueCount = (img) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 255) n++; return n; };
const semiCount = (img) => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0 && img.data[i] < 255) n++; return n; };
const square = (w = 60, fill = [20, 20, 20, 255]) => make(w, w, (x, y) => x >= 15 && x < 45 && y >= 15 && y < 45 ? fill : [0, 0, 0, 0]);

test("pad grows the canvas and keeps the art in the middle", () => {
  const out = im.pad(square(), 5);
  assert.equal(out.width, 70); assert.equal(out.height, 70);
  assert.equal(alphaAt(out, 35, 35), 255);
  assert.equal(alphaAt(out, 2, 2), 0);
});

test("duotone maps dark to the first color and light to the second", () => {
  const img = make(2, 1, (x) => x ? [255, 255, 255, 255] : [0, 0, 0, 255]);
  const out = im.duotone(img, [10, 20, 30], [200, 210, 220]);
  assert.deepEqual(px(out, 0, 0), [10, 20, 30, 255]);
  assert.deepEqual(px(out, 1, 0), [200, 210, 220, 255]);
});

test("stencil keeps dark pixels as solid ink and drops light ones", () => {
  const img = make(2, 1, (x) => x ? [240, 240, 240, 255] : [10, 10, 10, 255]);
  const out = im.stencil(img, 128, [255, 0, 0]);
  assert.deepEqual(px(out, 0, 0), [255, 0, 0, 255]);
  assert.equal(alphaAt(out, 1, 0), 0);
});

test("pixelate makes flat blocks with solid alpha", () => {
  const img = make(40, 40, (x, y) => [x * 6, y * 6, 100, 255]);
  const out = im.pixelate(img, 25); // 10px blocks
  assert.deepEqual(px(out, 0, 0), px(out, 9, 9));
  assert.notDeepEqual(px(out, 0, 0), px(out, 10, 0));
  assert.equal(semiCount(out), 0);
});

test("halftone makes solid dots, bigger where the art is darker", () => {
  const img = make(120, 60, (x) => x < 60 ? [30, 30, 30, 255] : [190, 190, 190, 255]);
  const out = im.halftone(img, { cellPct: 8, angle: 0 });
  assert.equal(semiCount(out), 0);
  let dark = 0, light = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 120; x++) if (alphaAt(out, x, y)) x < 60 ? dark++ : light++;
  assert.ok(dark > light * 1.5, `dark ${dark} light ${light}`);
  assert.ok(dark < 60 * 60, "leaves gaps between dots");
  const inverted = im.halftone(img, { cellPct: 8, angle: 0, by: "light" });
  let d2 = 0, l2 = 0;
  for (let y = 0; y < 60; y++) for (let x = 0; x < 120; x++) if (alphaAt(inverted, x, y)) x < 60 ? d2++ : l2++;
  assert.ok(l2 > d2, "light mode puts bigger dots on light areas");
});

test("distress removes some of the art, repeatably, and only removes", () => {
  const img = make(100, 100, () => [0, 0, 255, 255]);
  const a = im.distress(img, { amount: 60, seed: 3 }), b = im.distress(img, { amount: 60, seed: 3 });
  assert.deepEqual(a.data, b.data);
  const kept = opaqueCount(a) / (100 * 100);
  assert.ok(kept > 0.4 && kept < 0.97, `kept ${kept}`);
  assert.equal(semiCount(a), 0);
  assert.equal(opaqueCount(im.distress(img, { amount: 0 })), 100 * 100);
});

test("outline adds a solid band and room for it", () => {
  const out = im.outline(square(), { widthPct: 5, color: [255, 255, 255] }); // 3px
  assert.ok(out.width >= 66);
  const off = (out.width - 60) / 2;
  assert.deepEqual(px(out, off + 13, off + 30), [255, 255, 255, 255]); // just left of the square
  assert.deepEqual(px(out, off + 30, off + 30), [20, 20, 20, 255]); // the art itself
  assert.equal(alphaAt(out, 0, 0), 0);
  assert.equal(semiCount(out), 0);
});

test("dropShadow puts a hard offset copy behind the art", () => {
  const out = im.dropShadow(square(), { dxPct: 5, dyPct: 5, color: [255, 0, 0] }); // 3px
  assert.equal(out.width, 63); assert.equal(out.height, 63);
  assert.deepEqual(px(out, 46, 46), [255, 0, 0, 255]); // shadow peeks out bottom-right
  assert.deepEqual(px(out, 20, 20), [20, 20, 20, 255]);
  assert.equal(alphaAt(out, 14, 14), 0);
});

test("maskShape cuts the art to a shape", () => {
  const img = make(50, 50, () => [9, 9, 9, 255]);
  for (const [shape] of im.MASKS) {
    const out = im.maskShape(img, shape);
    assert.equal(alphaAt(out, 25, 28), 255, `${shape} keeps the middle`);
    if (shape !== "arch") assert.equal(alphaAt(out, 0, 0), 0, `${shape} drops the corner`);
  }
});

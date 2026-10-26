// Shirt builder image tools. Every function takes {width, height, data: RGBA Uint8ClampedArray}
// (ImageData works as-is) and returns a new image; inputs are never changed.

export const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
export const clone = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });

const clamp = (v, lo = 0, hi = 255) => (v < lo ? lo : v > hi ? hi : v);
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---------- color ----------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    t = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export function adjust(img, { brightness = 0, contrast = 0, saturation = 0, hue = 0, gamma = 1 } = {}) {
  const out = clone(img), d = out.data;
  const b = brightness * 2.55;
  const c = (259 * (contrast * 2.55 + 255)) / (255 * (259 - contrast * 2.55));
  const sat = 1 + saturation / 100, hShift = (((hue % 360) + 360) % 360) / 360;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp(255 * Math.pow(clamp(c * (i + b - 128) + 128) / 255, 1 / gamma));
  const doHsl = saturation !== 0 || hShift !== 0;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]], g = lut[d[i + 1]], bl = lut[d[i + 2]];
    if (doHsl) {
      let [h, s, l] = rgbToHsl(r, g, bl);
      [r, g, bl] = hslToRgb((h + hShift) % 1, clamp(s * sat, 0, 1), l);
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = bl;
  }
  return out;
}

export function invert(img) {
  const out = clone(img), d = out.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  return out;
}

export function grayscale(img) {
  const out = clone(img), d = out.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d[i], d[i + 1], d[i + 2]);
  return out;
}

export function autoLevels(img, clipPct = 0.5) {
  const d = img.data, hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { hist[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; n++; }
  if (!n) return clone(img);
  const cut = (n * clipPct) / 100;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) <= cut) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) <= cut) hi--;
  if (hi <= lo) return clone(img);
  const out = clone(img), o = out.data, k = 255 / (hi - lo);
  for (let i = 0; i < o.length; i += 4) for (let c = 0; c < 3; c++) o[i + c] = clamp((o[i + c] - lo) * k);
  return out;
}

export function recolorSolid(img, [r, g, b]) {
  const out = clone(img), d = out.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  return out;
}

const dist = (d, i, [r, g, b]) => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);

// Pixels within tolerance take the new color fully; up to 1.5x tolerance they blend toward it.
export function replaceColor(img, from, to, tolerance = 40) {
  const out = clone(img), d = out.data, soft = tolerance * 1.5;
  for (let i = 0; i < d.length; i += 4) {
    const dd = dist(d, i, from);
    if (dd >= soft) continue;
    const t = dd <= tolerance ? 1 : 1 - (dd - tolerance) / (soft - tolerance);
    for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (to[c] - d[i + c]) * t;
  }
  return out;
}

// ---------- background ----------
function edgeColor(img) {
  const { width: w, height: h, data: d } = img, counts = new Map();
  let best = [255, 255, 255], top = 0;
  const visit = (x, y) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] < 128) return;
    const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    if (n > top) { top = n; best = [d[i], d[i + 1], d[i + 2]]; }
  };
  for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
  for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
  return best;
}

export function removeBackground(img, { color = null, tolerance = 30, contiguous = true, feather = 1 } = {}) {
  const { width: w, height: h } = img, out = clone(img), d = out.data;
  const key = color ?? edgeColor(img);
  const match = (p) => d[p * 4 + 3] === 0 || dist(d, p * 4, key) <= tolerance;
  const hit = new Uint8Array(w * h);
  if (contiguous) {
    const stack = [];
    const push = (p) => { if (!hit[p] && match(p)) { hit[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
  } else {
    for (let p = 0; p < w * h; p++) if (match(p)) hit[p] = 1;
  }
  for (let p = 0; p < w * h; p++) if (hit[p]) d[p * 4 + 3] = 0;
  // Soften the cut edge: kept pixels next to removed ones fade by closeness to the key color.
  if (feather > 0) {
    const f = Math.round(feather), soft = tolerance * 2.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (hit[p] || !d[p * 4 + 3]) continue;
      let near = false;
      for (let dy = -f; dy <= f && !near; dy++) for (let dx = -f; dx <= f; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && hit[yy * w + xx]) { near = true; break; }
      }
      if (!near) continue;
      const dd = dist(d, p * 4, key);
      if (dd < soft) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * clamp((dd - tolerance) / (soft - tolerance), 0, 1));
    }
  }
  return out;
}

// ---------- alpha / DTF ----------
export function removeSemiTransparent(img, threshold = 128) {
  const out = clone(img), d = out.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < threshold ? 0 : 255;
  return out;
}

// Separable min/max filter over a (2px+1) square.
function morph(img, px, isMin) {
  const { width: w, height: h } = img, out = clone(img);
  if (px <= 0) return out;
  const a = new Uint8Array(w * h), t = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) a[p] = img.data[p * 4 + 3];
  const pick = isMin ? Math.min : Math.max, edge = 0; // outside the image counts as empty
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = isMin ? 255 : 0;
    for (let k = -px; k <= px; k++) { const xx = x + k; v = pick(v, xx < 0 || xx >= w ? edge : a[y * w + xx]); }
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = isMin ? 255 : 0;
    for (let k = -px; k <= px; k++) { const yy = y + k; v = pick(v, yy < 0 || yy >= h ? edge : t[yy * w + x]); }
    out.data[(y * w + x) * 4 + 3] = v;
  }
  return out;
}
export const chokeAlpha = (img, px = 1) => morph(img, Math.round(px), true);
export const dilateAlpha = (img, px = 1) => morph(img, Math.round(px), false);

export function thinLineReport(img, minPx) {
  const r = Math.floor(minPx / 2), opened = dilateAlpha(chokeAlpha(img, r), r);
  let thinPixels = 0, totalPixels = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i] < 128) continue;
    totalPixels++;
    if (opened.data[i] < 128) thinPixels++;
  }
  return { thinPixels, totalPixels, ratio: totalPixels ? thinPixels / totalPixels : 0 };
}

export function dtfPrep(img, { threshold = 128, choke = 1, knockout = null, knockoutTolerance = 30 } = {}) {
  let removedSemi = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0 && img.data[i] < 255) removedSemi++;
  let out = removeSemiTransparent(img, threshold);
  if (knockout) {
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && dist(d, i, knockout) <= knockoutTolerance) d[i + 3] = 0;
  }
  if (choke > 0) out = chokeAlpha(out, choke);
  return { image: out, report: { removedSemi, thin: thinLineReport(out, 4) } };
}

// ---------- blur, sharpen, halftone ----------
// Three box passes approximate a Gaussian; edges clamp so borders don't darken.
function boxBlur1(src, dst, w, h, r, horizontal) {
  const n = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, inv = 1 / (2 * r + 1);
  const last = (n - 1) * step;
  for (let l = 0; l < lines; l++) {
    const base = horizontal ? l * w : l, first = src[base], end = src[base + last];
    let sum = first * (r + 1);
    for (let k = 1; k <= r; k++) sum += src[base + Math.min(k, n - 1) * step];
    for (let k = 0, o = base; k < n; k++, o += step) {
      dst[o] = sum * inv;
      const add = k + r + 1, sub = k - r;
      sum += (add < n ? src[base + add * step] : end) - (sub > 0 ? src[base + sub * step] : first);
    }
  }
}
function gaussian(chan, w, h, sigma) {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const tmp = new Float32Array(chan.length);
  for (let i = 0; i < 3; i++) { boxBlur1(chan, tmp, w, h, r, true); boxBlur1(tmp, chan, w, h, r, false); }
  return chan;
}
function split(img, premultiply) {
  const n = img.width * img.height, d = img.data, ch = [0, 1, 2, 3].map(() => new Float32Array(n));
  for (let p = 0; p < n; p++) {
    const a = d[p * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) ch[c][p] = premultiply ? d[p * 4 + c] * a : d[p * 4 + c];
    ch[3][p] = d[p * 4 + 3];
  }
  return ch;
}

export function unsharp(img, { amount = 0.6, radius = 1, threshold = 2 } = {}) {
  const { width: w, height: h } = img, out = clone(img), d = out.data;
  const ch = split(img, false);
  for (let c = 0; c < 3; c++) gaussian(ch[c], w, h, radius);
  for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) {
    const v = img.data[p * 4 + c], diff = v - ch[c][p];
    if (Math.abs(diff) >= threshold) d[p * 4 + c] = clamp(v + diff * amount);
  }
  return out;
}

// Halftone removal: blur the dots together (color premultiplied so empty gaps don't dilute it),
// close the alpha into solid shapes, then sharpen the edges back up.
// scale: how many times larger this copy is than the one the customer previewed, so the print matches the preview
export function descreen(img, { strength = 2, alphaThreshold = 0.35, scale = 1 } = {}) {
  const { width: w, height: h } = img, s = clamp(strength, 1, 5), sigma = (s * 1.2 + 0.8) * Math.max(0.25, scale);
  const ch = split(img, true);
  for (const c of ch) gaussian(c, w, h, sigma);
  const out = blank(w, h), d = out.data, cut = alphaThreshold * 255;
  for (let p = 0; p < w * h; p++) {
    const a = ch[3][p];
    if (a < cut || a <= 0) continue;
    const k = 255 / a;
    d[p * 4] = ch[0][p] * k; d[p * 4 + 1] = ch[1][p] * k; d[p * 4 + 2] = ch[2][p] * k; d[p * 4 + 3] = 255;
  }
  return unsharp(out, { amount: 0.8, radius: 1, threshold: 3 });
}

export function denoise(img, radius = 1) {
  const { width: w, height: h } = img, out = clone(img), d = out.data, s = img.data;
  const buf = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    if (!s[p + 3]) continue;
    buf[0].length = buf[1].length = buf[2].length = 0;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = (yy * w + xx) * 4;
      if (!s[q + 3]) continue;
      buf[0].push(s[q]); buf[1].push(s[q + 1]); buf[2].push(s[q + 2]);
    }
    for (let c = 0; c < 3; c++) { const b = buf[c].sort((m, n) => m - n); d[p + c] = b[b.length >> 1]; }
  }
  return out;
}

// k-means on visible pixels (sampled for speed), then map every pixel to its nearest center.
export function quantize(img, colors = 8) {
  const d = img.data, n = img.width * img.height, vis = [];
  for (let p = 0; p < n; p++) if (d[p * 4 + 3]) vis.push(p);
  const out = clone(img);
  if (!vis.length) return { image: out, palette: [] };
  const step = Math.max(1, Math.floor(vis.length / 20000)), sample = vis.filter((_, i) => i % step === 0);
  const k = Math.min(colors, sample.length);
  let centers = Array.from({ length: k }, (_, i) => {
    const q = sample[Math.floor(((i + 0.5) * sample.length) / k)] * 4;
    return [d[q], d[q + 1], d[q + 2]];
  });
  const nearest = (q) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i], dd = (d[q] - c[0]) ** 2 + (d[q + 1] - c[1]) ** 2 + (d[q + 2] - c[2]) ** 2;
      if (dd < bd) { bd = dd; bi = i; }
    }
    return bi;
  };
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const p of sample) { const q = p * 4, s = sums[nearest(q)]; s[0] += d[q]; s[1] += d[q + 1]; s[2] += d[q + 2]; s[3]++; }
    let moved = 0;
    centers = centers.map((c, i) => {
      const s = sums[i];
      if (!s[3]) return c;
      const nc = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
      moved += Math.abs(nc[0] - c[0]) + Math.abs(nc[1] - c[1]) + Math.abs(nc[2] - c[2]);
      return nc;
    });
    if (moved < 1) break;
  }
  centers = centers.map((c) => c.map(Math.round));
  const o = out.data;
  for (const p of vis) { const q = p * 4, c = centers[nearest(q)]; o[q] = c[0]; o[q + 1] = c[1]; o[q + 2] = c[2]; }
  return { image: out, palette: centers };
}

// ---------- size ----------
const cubic = (x) => { // Catmull-Rom
  x = Math.abs(x);
  return x < 1 ? 1.5 * x ** 3 - 2.5 * x ** 2 + 1 : x < 2 ? -0.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2 : 0;
};
export function resize(img, w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const sw = img.width, sh = img.height, ch = split(img, true), out = blank(w, h), d = out.data;
  const sx = sw / w, sy = sh / h;
  // Weights per output column/row; widen the kernel when shrinking to avoid aliasing.
  const weights = (n, sn, scale) => Array.from({ length: n }, (_, o) => {
    const center = (o + 0.5) * scale - 0.5, support = 2 * Math.max(1, scale), ws = [];
    let total = 0;
    for (let s = Math.floor(center - support) + 1; s <= Math.ceil(center + support) - 1; s++) {
      const wt = cubic((s - center) / Math.max(1, scale));
      if (!wt) continue;
      ws.push(clamp(s, 0, sn - 1), wt); total += wt;
    }
    for (let i = 1; i < ws.length; i += 2) ws[i] /= total;
    return ws;
  });
  const wx = weights(w, sw, sx), wy = weights(h, sh, sy);
  const tmp = [0, 1, 2, 3].map(() => new Float32Array(w * sh));
  for (let y = 0; y < sh; y++) for (let x = 0; x < w; x++) {
    const ws = wx[x];
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let i = 0; i < ws.length; i += 2) v += ch[c][y * sw + ws[i]] * ws[i + 1];
      tmp[c][y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    const ws = wy[y];
    for (let x = 0; x < w; x++) {
      const v = [0, 0, 0, 0];
      for (let i = 0; i < ws.length; i += 2) for (let c = 0; c < 4; c++) v[c] += tmp[c][ws[i] * w + x] * ws[i + 1];
      const p = (y * w + x) * 4, a = clamp(v[3]);
      d[p + 3] = a;
      if (a > 0) { const k = 255 / a; d[p] = v[0] * k; d[p + 1] = v[1] * k; d[p + 2] = v[2] * k; }
    }
  }
  return out;
}
export const upscale = (img, factor = 2) =>
  unsharp(resize(img, img.width * factor, img.height * factor), { amount: 0.5, radius: factor / 2, threshold: 2 });

export function trimTransparent(img) {
  const { width: w, height: h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return { image: blank(1, 1), x: 0, y: 0 };
  const tw = x1 - x0 + 1, th = y1 - y0 + 1, out = blank(tw, th);
  for (let y = 0; y < th; y++) out.data.set(d.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * tw * 4);
  return { image: out, x: x0, y: y0 };
}

// ---------- print math ----------
export function printStats(pxW, pxH, inW, inH) {
  const dpiX = pxW / inW, dpiY = pxH / inH, dpi = Math.min(dpiX, dpiY);
  return { dpiX, dpiY, dpi, level: dpi >= 300 ? "good" : dpi >= 150 ? "ok" : "low" };
}

export function price({ cost, margin, printFee, upcharge = 0 }) {
  for (const [k, v] of Object.entries({ cost, margin, printFee, upcharge }))
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`Invalid ${k}: ${v}`);
  // Next x.99 at or above the raw price, so rounding never lowers it.
  const cents = Math.round((cost * (1 + margin) + printFee + upcharge) * 100);
  return Math.ceil((cents + 1) / 100) - 0.01;
}

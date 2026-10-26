// Drawing for the shirt builder: badge shapes, vector art (clip art, shapes, freehand lines) and styled text.
// Everything draws onto a canvas at whatever size is asked for, so the screen preview and the 300 DPI print
// come from the same code. Effects stay DTF-friendly: solid fills, solid outlines and hard (offset) shadows,
// never soft glows or see-through pixels.

// ---------- badge shapes (100 x 100 box) ----------
const r1 = (v) => Math.round(v * 100) / 100;
const poly = (pts) => `M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L")}Z`;
const ngon = (n, rad = 50, rot = -Math.PI / 2, cx = 50, cy = 50) => Array.from({ length: n }, (_, i) => [cx + rad * Math.cos(rot + (i * 2 * Math.PI) / n), cy + rad * Math.sin(rot + (i * 2 * Math.PI) / n)]);
const star = (n, inner, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const rr = i % 2 ? 50 * inner : 50; const a = rot + (i * Math.PI) / n; return [50 + rr * Math.cos(a), 50 + rr * Math.sin(a)]; });
const circ = (cx, cy, rad) => `M${r1(cx - rad)} ${r1(cy)}a${r1(rad)} ${r1(rad)} 0 1 0 ${r1(rad * 2)} 0a${r1(rad)} ${r1(rad)} 0 1 0 ${r1(-rad * 2)} 0Z`;
const rrect = (x, y, w, h, rad) => `M${x + rad} ${y}H${x + w - rad}A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}V${y + h - rad}A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}H${x + rad}A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}V${y + rad}A${rad} ${rad} 0 0 1 ${x + rad} ${y}Z`;

// [id, name, path, { vb: [w, h], evenodd }]
export const SHAPES = [
  ["circle", "Circle", circ(50, 50, 50)],
  ["ring", "Ring", circ(50, 50, 50) + circ(50, 50, 40), { evenodd: true }],
  ["square", "Square", "M0 0H100V100H0Z"],
  ["rounded", "Rounded", rrect(0, 0, 100, 100, 18)],
  ["triangle", "Triangle", poly([[50, 4], [100, 92], [0, 92]])],
  ["diamond", "Diamond", poly([[50, 0], [100, 50], [50, 100], [0, 50]])],
  ["hexagon", "Hexagon", poly(ngon(6))],
  ["octagon", "Octagon", poly(ngon(8, 50, -Math.PI / 8))],
  ["star", "Star", poly(star(5, 0.42))],
  ["star6", "6-point star", poly(star(6, 0.55))],
  ["burst", "Burst", poly(star(12, 0.72))],
  ["seal", "Seal", poly(star(24, 0.88))],
  ["heart", "Heart", "M50 92C20 70 0 52 0 30C0 13 13 2 28 2C38 2 46 8 50 16C54 8 62 2 72 2C87 2 100 13 100 30C100 52 80 70 50 92Z"],
  ["shield", "Shield", "M50 0L96 14V46C96 74 76 92 50 100C24 92 4 74 4 46V14Z"],
  ["banner", "Banner", "M0 30H12V18H88V30H100L90 50L100 70H82V82H18V70H0L10 50Z", { vb: [100, 100] }],
  ["ribbon", "Ribbon", "M0 8H100L88 28L100 48H0L12 28Z", { vb: [100, 56] }],
  ["arch", "Arch", "M0 100V50A50 50 0 0 1 100 50V100Z"],
  ["ticket", "Ticket", "M0 0H100V38A12 12 0 0 0 100 62V100H0V62A12 12 0 0 0 0 38Z"],
  ["bubble", "Speech bubble", "M10 0H90A10 10 0 0 1 100 10V62A10 10 0 0 1 90 72H40L18 94L22 72H10A10 10 0 0 1 0 62V10A10 10 0 0 1 10 0Z"],
  ["cloud", "Cloud", "M24 80C10 80 0 70 0 57C0 45 9 36 21 35C23 20 35 10 50 10C63 10 74 18 78 30C91 31 100 41 100 54C100 68 89 80 75 80Z"],
  ["drop", "Drop", "M50 0C50 0 86 42 86 64A36 36 0 0 1 14 64C14 42 50 0 50 0Z"],
  ["bolt", "Lightning", poly([[58, 0], [14, 58], [46, 58], [36, 100], [86, 38], [54, 38]])],
  ["arrow", "Arrow", poly([[0, 38], [62, 38], [62, 14], [100, 50], [62, 86], [62, 62], [0, 62]])],
  ["chevron", "Chevron", poly([[0, 0], [40, 0], [100, 50], [40, 100], [0, 100], [60, 50]])],
  ["plus", "Plus", poly([[36, 0], [64, 0], [64, 36], [100, 36], [100, 64], [64, 64], [64, 100], [36, 100], [36, 64], [0, 64], [0, 36], [36, 36]])],
  ["moon", "Moon", "M62 2A50 50 0 1 0 98 66A40 40 0 1 1 62 2Z"],
  ["sun", "Sun", poly(star(16, 0.62)) + circ(50, 50, 24), { evenodd: true }],
  ["frame", "Circle frame", circ(50, 50, 50) + circ(50, 50, 45) + circ(50, 50, 41) + circ(50, 50, 38), { evenodd: true }],
  ["box", "Box frame", "M0 0H100V100H0Z M6 6V94H94V6Z", { evenodd: true }],
  ["splash", "Splash", (() => { const p = []; for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, rr = i % 2 ? 30 + ((i * 37) % 11) : 44 + ((i * 53) % 7); p.push([50 + rr * Math.cos(a), 50 + rr * Math.sin(a)]); } return poly(p); })()],
  ["stripe", "Bar", "M0 0H100V14H0Z", { vb: [100, 14] }],
  ["wave", "Wave line", "M0 8Q12.5 0 25 8T50 8T75 8T100 8V16Q87.5 24 75 16T50 16T25 16T0 16Z", { vb: [100, 24] }],
].map(([id, name, d, o = {}]) => ({ id, name, d, vb: o.vb ?? [100, 100], evenodd: !!o.evenodd }));

// ---------- paint helpers ----------
const linGrad = (ctx, w, h, c1, c2, angle = 90) => {
  const a = (angle * Math.PI) / 180, dx = Math.sin(a) * w / 2, dy = -Math.cos(a) * h / 2;
  const g = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  return g;
};

// Vector art. v: { d, vb: [w, h], evenodd, fill, grad, gradAngle, outline, outlineW, shadow, shadowX, shadowY, line }
// outlineW, shadowX/Y and line are in percent of the art's longest side. `line` > 0 draws the path as a stroke
// (freehand drawing) instead of filling it.
export function renderVec(v, px) {
  const [vw, vh] = v.vb ?? [100, 100];
  const k = px / Math.max(vw, vh);
  const unit = Math.max(vw, vh) / 100;
  const ow = (v.outlineW ?? 0) * unit, lw = (v.line ?? 0) * unit;
  const sx = v.shadow ? (v.shadowX ?? 0) * unit : 0, sy = v.shadow ? (v.shadowY ?? 0) * unit : 0;
  const pad = ow + lw / 2 + 2;
  const x0 = -pad + Math.min(0, sx), y0 = -pad + Math.min(0, sy);
  const W = Math.ceil((vw + pad * 2 + Math.abs(sx)) * k), H = Math.ceil((vh + pad * 2 + Math.abs(sy)) * k);
  const c = document.createElement("canvas");
  c.width = Math.max(1, W); c.height = Math.max(1, H);
  const ctx = c.getContext("2d");
  const path = new Path2D(v.d);
  const rule = v.evenodd ? "evenodd" : "nonzero";
  const draw = (fill, dx, dy, withOutline) => {
    ctx.save();
    ctx.scale(k, k); ctx.translate(-x0 + dx, -y0 + dy);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (lw) {
      if (withOutline && ow) { ctx.strokeStyle = withOutline; ctx.lineWidth = lw + ow * 2; ctx.stroke(path); }
      ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.stroke(path);
    } else {
      if (withOutline && ow) { ctx.strokeStyle = withOutline; ctx.lineWidth = ow * 2; ctx.stroke(path); }
      ctx.fillStyle = fill; ctx.fill(path, rule);
    }
    ctx.restore();
  };
  if (v.shadow) draw(v.shadow, sx, sy, v.shadow);
  const fill = v.grad ? linGrad(ctx, W, H, v.fill, v.grad, v.gradAngle ?? 90) : v.fill;
  if (v.grad) {
    // the gradient is laid out in canvas pixels, so draw it without the path transform
    ctx.save(); ctx.scale(k, k); ctx.translate(-x0, -y0);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (ow) { ctx.strokeStyle = v.outline; ctx.lineWidth = (lw || 0) + ow * 2; ctx.stroke(path); }
    ctx.restore();
    ctx.save(); ctx.scale(k, k); ctx.translate(-x0, -y0);
    const inv = new DOMMatrix().translate(x0, y0).scale(1 / k, 1 / k);
    const g = linGrad(ctx, W, H, v.fill, v.grad, v.gradAngle ?? 90);
    const pat = ctx.createPattern(gradCanvas(W, H, g), "no-repeat");
    pat.setTransform(inv);
    if (lw) { ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = pat; ctx.lineWidth = lw; ctx.stroke(path); }
    else { ctx.fillStyle = pat; ctx.fill(path, rule); }
    ctx.restore();
  } else draw(fill, 0, 0, ow ? v.outline : null);
  return c;
}
function gradCanvas(w, h, g) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  return c;
}

// ---------- text ----------
// t: { value, font, color, outline, outlineW, spacing, curve, align, warp, grad, gradAngle, shadow, shadowX, shadowY,
//      upper, lineH, outline2, outline2W }. warp: "arc" (uses curve), "circle", "wave", "rise" or "none".
// Returns a canvas trimmed to the ink.
export const WARPS = [["none", "Straight"], ["arc", "Arc"], ["circle", "Circle"], ["wave", "Wave"], ["rise", "Rise"]];
export function renderText(t, px) {
  const mc = document.createElement("canvas").getContext("2d");
  const font = `${px}px "${t.font}", system-ui, sans-serif`;
  mc.font = font;
  let text = String(t.value || " ");
  if (t.upper) text = text.toUpperCase();
  const warp = t.warp ?? "arc";
  const amt = (t.curve ?? 0) / 100;
  const lines = warp === "circle" ? [text.replace(/\n+/g, " ")] : text.split("\n");
  const sp = (t.spacing ?? 0) * px / 100;
  const cw = (ch) => mc.measureText(ch).width;
  const widthOf = (s) => [...s].reduce((a, ch) => a + cw(ch) + sp, 0) - sp;
  const lh = px * (t.lineH ?? 1.15);
  const maxW = Math.max(...lines.map(widthOf), 1);
  // place every glyph: x, y (centre of the glyph cell), rotation
  const glyphs = [];
  lines.forEach((line, li) => {
    const lw = widthOf(line);
    let x = t.align === "left" ? -maxW / 2 : t.align === "right" ? maxW / 2 - lw : -lw / 2;
    const baseY = lh * (li - (lines.length - 1) / 2);
    const total = lw || 1;
    if (warp === "circle" && amt) {
      const frac = Math.max(0.1, Math.min(1, Math.abs(amt)));
      const R = total / (2 * Math.PI * frac);
      let s = 0;
      for (const ch of line) {
        const w = cw(ch), mid = s + w / 2;
        if (amt > 0) { const th = -Math.PI / 2 + (mid / total - 0.5) * frac * 2 * Math.PI; glyphs.push({ ch, x: R * Math.cos(th), y: R * Math.sin(th), a: th + Math.PI / 2, w }); }
        else { const th = Math.PI / 2 - (mid / total - 0.5) * frac * 2 * Math.PI; glyphs.push({ ch, x: R * Math.cos(th), y: R * Math.sin(th), a: th - Math.PI / 2, w }); }
        s += w + sp;
      }
      return;
    }
    for (const ch of line) {
      const w = cw(ch), mid = x + w / 2, rel = mid / (maxW / 2 || 1);
      let dy = 0, a = 0;
      if (warp === "arc") { dy = -amt * maxW * 0.35 * (1 - rel * rel); a = amt * rel * 0.7; }
      else if (warp === "wave") dy = -amt * px * 0.6 * Math.sin(rel * Math.PI);
      else if (warp === "rise") dy = -amt * mid * 0.4;
      glyphs.push({ ch, x: mid, y: baseY + dy, a, w });
      x += w + sp;
    }
  });
  const ow = (t.outlineW ?? 0) * px / 25, ow2 = (t.outline2W ?? 0) * px / 25;
  const sx = t.shadow ? (t.shadowX ?? 0) * px / 100 : 0, sy = t.shadow ? (t.shadowY ?? 0) * px / 100 : 0;
  const reach = px * 0.85 + ow + ow2 + 4;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const g of glyphs) { x0 = Math.min(x0, g.x - g.w / 2 - reach, g.x - reach); x1 = Math.max(x1, g.x + g.w / 2 + reach, g.x + reach); y0 = Math.min(y0, g.y - reach); y1 = Math.max(y1, g.y + reach); }
  if (!glyphs.length) { x0 = y0 = -px; x1 = y1 = px; }
  x0 += Math.min(0, sx); y0 += Math.min(0, sy); x1 += Math.max(0, sx); y1 += Math.max(0, sy);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(x1 - x0)); c.height = Math.max(1, Math.ceil(y1 - y0));
  const ctx = c.getContext("2d");
  ctx.font = font; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const pass = (style, dx, dy, strokeW) => {
    for (const g of glyphs) {
      ctx.save(); ctx.translate(g.x - x0 + dx, g.y - y0 + dy); ctx.rotate(g.a);
      if (strokeW) { ctx.strokeStyle = style; ctx.lineWidth = strokeW; ctx.strokeText(g.ch, -g.w / 2, 0); }
      else { ctx.fillStyle = style; ctx.fillText(g.ch, -g.w / 2, 0); }
      ctx.restore();
    }
  };
  if (t.shadow) { if (ow + ow2) pass(t.shadow, sx, sy, (ow + ow2) * 2); pass(t.shadow, sx, sy, 0); }
  if (ow2) pass(t.outline2 ?? "#ffffff", 0, 0, (ow + ow2) * 2);
  if (ow) pass(t.outline, 0, 0, ow * 2);
  pass(t.grad ? linGrad(ctx, c.width, c.height, t.color, t.grad, t.gradAngle ?? 180) : t.color, 0, 0, 0);
  return trimCanvas(c);
}

export function trimCanvas(c) {
  const ctx = c.getContext("2d"), d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const pad = 4, o = document.createElement("canvas");
  o.width = x1 - x0 + 1 + pad * 2; o.height = y1 - y0 + 1 + pad * 2;
  o.getContext("2d").drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

// Freehand points (inches) to a smooth path in a local box. Returns { d, vb, x, y } where x, y is the box's
// top-left in inches; the path is in hundredths of an inch.
export function strokePath(points) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const P = points.map(([x, y]) => [(x - x0) * 100, (y - y0) * 100]);
  let d = `M${r1(P[0][0])} ${r1(P[0][1])}`;
  if (P.length === 1) d += `L${r1(P[0][0] + 0.1)} ${r1(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) d += ` Q${r1(P[i][0])} ${r1(P[i][1])} ${r1((P[i][0] + P[i + 1][0]) / 2)} ${r1((P[i][1] + P[i + 1][1]) / 2)}`;
  if (P.length > 1) d += ` L${r1(P.at(-1)[0])} ${r1(P.at(-1)[1])}`;
  return { d, vb: [Math.max(1, (x1 - x0) * 100), Math.max(1, (y1 - y0) * 100)], x: x0, y: y0 };
}

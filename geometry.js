// Epix3D pattern maker: seeded geometric art as SVG, ready to drop on a shirt.
// Pure functions, no DOM. Every design comes from (style, palette, shape, density, seed), so the same
// settings always give the same art and an order can be re-made from its name.
// Drawn on a 1000-unit square. Strokes and gaps stay at least 8 units (about 2 mm on a 10 in print)
// so nothing is too thin for DTF, and every fill is solid (no see-through pixels).

export const SIZE = 1000;
const MIN_LINE = 8;

export const STYLES = [
  ["sunset", "Retro sunset"], ["stripes", "Stripes"], ["checker", "Checkerboard"], ["dots", "Polka dots"], ["waves", "Waves"],
  ["chevron", "Zigzag"], ["plaid", "Plaid"], ["camo", "Camo"], ["halftone", "Halftone"], ["memphis", "Memphis 90s"],
  ["stars", "Stars"], ["hex", "Hex grid"], ["cubes", "3D cubes"], ["tri", "Triangles"], ["truchet", "Circuit"],
  ["rings", "Op rings"], ["burst", "Burst"], ["shift", "Shifted squares"], ["glitch", "Glitch bars"],
];
export const SHAPES = [["circle", "Circle"], ["hex", "Hexagon"], ["square", "Square"], ["diamond", "Diamond"], ["shield", "Shield"], ["none", "Full"]];
// `on`: the shirt shade a palette reads best on, used to pick a sensible default.
export const PALETTES = [
  { id: "retro", name: "Retro", on: "any", colors: ["#f9c74f", "#f8961e", "#f3722c", "#c1121f"] },
  { id: "pastel", name: "Pastel", on: "dark", colors: ["#ffd6e0", "#c1e7ff", "#d4f0c0", "#fff1b8"] },
  { id: "camo", name: "Woodland", on: "any", colors: ["#4b5320", "#6b705c", "#a5a58d", "#2f2f24"] },
  { id: "usa", name: "Red white blue", on: "any", colors: ["#b22234", "#ffffff", "#3c3b6e", "#d9d9d9"] },
  { id: "neon", name: "Neon", on: "dark", colors: ["#c8ff2e", "#ff2e88", "#2ee6ff", "#8b5cff"] },
  { id: "concrete", name: "Concrete", on: "any", colors: ["#e9e7e2", "#a3a39e", "#5c5d62", "#2a2b2f"] },
  { id: "street", name: "Street", on: "any", colors: ["#ffd23f", "#ee4266", "#3bceac", "#540d6e"] },
  { id: "acid", name: "Acid", on: "dark", colors: ["#d4ff00", "#00ff9c", "#00b3ff", "#f4f4f4"] },
  { id: "sunset", name: "Sunset", on: "any", colors: ["#ff6b35", "#f7c59f", "#ffe66d", "#004e89"] },
  { id: "ink", name: "Ink", on: "light", colors: ["#111111", "#3a3a3a", "#6b6b6b", "#c8102e"] },
  { id: "chalk", name: "Chalk", on: "dark", colors: ["#ffffff", "#d9d9d9", "#9e9e9e", "#ff3b30"] },
  { id: "ocean", name: "Ocean", on: "any", colors: ["#00a6a6", "#bbdef0", "#f08700", "#1d3557"] },
];

// mulberry32: small, fast, good enough for art
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => Math.floor(Math.random() * 0xffffff);
export const defaultPalette = (shirtIsDark) => (shirtIsDark ? "neon" : "street");

// Short readable code for an order line, e.g. "hex/neon/circle/6/#3f2a1c"
export const codeOf = (o) => `${o.style}/${o.palette}/${o.shape}/${o.density}/#${(o.seed >>> 0).toString(16).padStart(6, "0")}`;
export function fromCode(code) {
  const m = String(code).trim().match(/^(\w+)\/(\w+)\/(\w+)\/(\d+)\/#([0-9a-f]{1,8})$/i);
  if (!m) return null;
  const o = { style: m[1], palette: m[2], shape: m[3], density: Number(m[4]), seed: parseInt(m[5], 16) };
  return normalize(o);
}

export function normalize(o = {}) {
  const pick = (list, v, i = 0) => (list.some(([k]) => k === v) ? v : list[i][0]);
  return {
    style: pick(STYLES, o.style),
    palette: PALETTES.some((p) => p.id === o.palette) ? o.palette : PALETTES[0].id,
    shape: pick(SHAPES, o.shape),
    density: Math.round(Math.min(12, Math.max(3, Number(o.density) || 6))),
    seed: (Number(o.seed) || 0) >>> 0,
  };
}

export function randomize(r = Math.random) {
  const any = (list) => list[Math.floor(r() * list.length)];
  return normalize({ style: any(STYLES)[0], palette: any(PALETTES).id, shape: any(SHAPES)[0], density: 3 + Math.floor(r() * 10), seed: Math.floor(r() * 0xffffff) });
}

// ---------- outline shapes ----------
const C = SIZE / 2;
function outline(shape) {
  const pts = (n, rot, rad = C - 4) => Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return `${f(C + rad * Math.cos(a))},${f(C + rad * Math.sin(a))}`;
  }).join(" ");
  switch (shape) {
    case "circle": return `<circle cx="${C}" cy="${C}" r="${C - 4}"/>`;
    case "hex": return `<polygon points="${pts(6, -Math.PI / 2)}"/>`;
    case "diamond": return `<polygon points="${pts(4, -Math.PI / 2)}"/>`;
    case "square": return `<rect x="40" y="40" width="${SIZE - 80}" height="${SIZE - 80}" rx="56"/>`;
    case "shield": return `<path d="M80 60 H920 V470 Q920 800 500 960 Q80 800 80 470 Z"/>`;
    default: return null;
  }
}

// ---------- styles ----------
// Each returns SVG markup drawn over the whole square; the outline clips it afterwards.
const STYLE_FNS = {
  sunset(r, cols, n, pal) {
    // a sun cut by horizontal bars that get thicker toward the bottom, 80s style
    const out = [], R = SIZE * 0.42, cy = C + SIZE * 0.06, bands = Math.max(3, Math.round(cols / 1.5)), gap = Math.max(MIN_LINE * 2, SIZE / (bands * 9));
    const id = `sun${Math.floor(r() * 1e6)}`;
    out.push(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${pal.map((c, i) => `<stop offset="${f(i / Math.max(1, pal.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient></defs>`);
    let mask = "";
    for (let i = 0; i < bands; i++) {
      const y = cy - R * 0.1 + (i * R * 1.1) / bands, h = gap * (1 + i * 0.6);
      mask += `<rect x="0" y="${f(y)}" width="${SIZE}" height="${f(h)}"/>`;
    }
    // draw the disc as an evenodd path minus the bars, so the gaps are truly see-through
    out.push(`<path fill="url(#${id})" fill-rule="evenodd" d="M${f(C - R)} ${f(cy)} a${f(R)} ${f(R)} 0 1 0 ${f(R * 2)} 0 a${f(R)} ${f(R)} 0 1 0 ${f(-R * 2)} 0Z"/>`);
    return `<g>${out.join("")}</g><g fill="#000" data-cut="1">${mask}</g>`;
  },
  stripes(r, cols, n, pal) {
    const w = SIZE / (cols * 2), ang = [0, 45, 90, -45][Math.floor(r() * 4)], out = [];
    for (let i = -cols * 3; i < cols * 3; i++) out.push(`<rect x="${f(i * w * 2)}" y="-1000" width="${f(w)}" height="3000" fill="${pal[((i % pal.length) + pal.length) % pal.length]}"/>`);
    return `<g transform="rotate(${ang} ${C} ${C})">${out.join("")}</g>`;
  },
  checker(r, cols, n, pal) {
    const s = SIZE / cols, out = [], warp = r() < 0.4;
    for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) if ((x + y) % 2 === 0) {
      const k = warp ? 1 + 0.25 * Math.sin((x + y) / 2) : 1;
      out.push(`<rect x="${f(x * s)}" y="${f(y * s)}" width="${f(s * k)}" height="${f(s * k)}" fill="${pal[(x + y) / 2 % pal.length | 0]}"/>`);
    }
    return out.join("");
  },
  dots(r, cols, n) {
    const s = SIZE / cols, rad = s * (0.22 + r() * 0.16), out = [];
    for (let y = 0; y <= cols; y++) for (let x = 0; x <= cols; x++) out.push(`<circle cx="${f(x * s + (y % 2 ? s / 2 : 0))}" cy="${f(y * s)}" r="${f(rad)}" fill="${n(r)}"/>`);
    return out.join("");
  },
  waves(r, cols, n, pal) {
    const rows = cols, h = SIZE / rows, amp = h * (0.25 + r() * 0.25), wl = SIZE / (2 + Math.floor(r() * 3)), wgt = Math.max(MIN_LINE * 2, h * 0.35), out = [];
    for (let i = 0; i <= rows; i++) {
      let d = `M-50 ${f(i * h)}`;
      for (let x = -50; x <= SIZE + 50; x += wl / 2) d += ` Q${f(x + wl / 4)} ${f(i * h + (((x + 50) / (wl / 2)) % 2 ? -amp : amp))} ${f(x + wl / 2)} ${f(i * h)}`;
      out.push(`<path d="${d}" fill="none" stroke="${pal[i % pal.length]}" stroke-width="${f(wgt)}" stroke-linecap="round"/>`);
    }
    return out.join("");
  },
  chevron(r, cols, n, pal) {
    const rows = cols, h = SIZE / rows, w = SIZE / cols, wgt = Math.max(MIN_LINE * 2, h * 0.4), out = [];
    for (let i = 0; i <= rows; i++) {
      let d = `M${f(-w)} ${f(i * h)}`;
      for (let x = -w; x <= SIZE + w; x += w) d += ` L${f(x + w / 2)} ${f(i * h - h * 0.45)} L${f(x + w)} ${f(i * h)}`;
      out.push(`<path d="${d}" fill="none" stroke="${pal[i % pal.length]}" stroke-width="${f(wgt)}" stroke-linejoin="miter"/>`);
    }
    return out.join("");
  },
  plaid(r, cols, n, pal) {
    // woven look from solid cells: where a dark row band meets a dark column band, use the darkest color
    const s = SIZE / (cols * 2), out = [], band = (i) => (i % 4 === 0 ? 2 : i % 2);
    for (let y = 0; y < cols * 2; y++) for (let x = 0; x < cols * 2; x++) {
      const v = band(x) + band(y), c = pal[Math.min(pal.length - 1, v === 0 ? 0 : v <= 1 ? 1 : v <= 2 ? 2 : 3)];
      out.push(`<rect x="${f(x * s)}" y="${f(y * s)}" width="${f(s + 0.5)}" height="${f(s + 0.5)}" fill="${c}"/>`);
    }
    return out.join("");
  },
  camo(r, cols, n, pal) {
    const out = [`<rect width="${SIZE}" height="${SIZE}" fill="${pal[0]}"/>`];
    const blobs = cols * cols * 1.2;
    for (let i = 0; i < blobs; i++) {
      const cx = r() * SIZE, cy = r() * SIZE, base = SIZE / cols * (0.4 + r() * 0.6), pts = 9, c = pal[1 + Math.floor(r() * (pal.length - 1))];
      const p = Array.from({ length: pts }, (_, k) => { const a = (k / pts) * Math.PI * 2, rr = base * (0.6 + r() * 0.6); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a) * 0.7]; });
      let d = `M${f((p[0][0] + p[pts - 1][0]) / 2)} ${f((p[0][1] + p[pts - 1][1]) / 2)}`;
      for (let k = 0; k < pts; k++) { const a = p[k], b = p[(k + 1) % pts]; d += ` Q${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; }
      out.push(`<path d="${d}Z" fill="${c}"/>`);
    }
    return out.join("");
  },
  halftone(r, cols, n, pal) {
    // dots that grow toward one corner, like a comic print
    const s = SIZE / (cols * 2), ang = r() * Math.PI * 2, out = [], c = pal[Math.floor(r() * pal.length)];
    for (let y = 0; y <= cols * 2; y++) for (let x = 0; x <= cols * 2; x++) {
      const px = x * s + (y % 2 ? s / 2 : 0), py = y * s;
      const t = ((px - C) * Math.cos(ang) + (py - C) * Math.sin(ang)) / SIZE + 0.5;
      const rad = s * 0.62 * Math.max(0, Math.min(1, t));
      if (rad >= MIN_LINE / 2) out.push(`<circle cx="${f(px)}" cy="${f(py)}" r="${f(rad)}" fill="${c}"/>`);
    }
    return out.join("");
  },
  memphis(r, cols, n) {
    // 90s confetti: squiggles, triangles, rings and dots
    const out = [], count = cols * cols, sz = SIZE / cols;
    for (let i = 0; i < count; i++) {
      const x = r() * SIZE, y = r() * SIZE, c = n(r), rot = f(r() * 360), k = sz * (0.25 + r() * 0.25), kind = Math.floor(r() * 4);
      if (kind === 0) out.push(`<path d="M${f(x - k)} ${f(y)} q${f(k / 2)} ${f(-k / 2)} ${f(k)} 0 t${f(k)} 0" fill="none" stroke="${c}" stroke-width="${f(Math.max(MIN_LINE * 1.5, k / 4))}" stroke-linecap="round" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`);
      else if (kind === 1) out.push(`<polygon points="${f(x)},${f(y - k)} ${f(x + k)},${f(y + k * 0.7)} ${f(x - k)},${f(y + k * 0.7)}" fill="${c}" transform="rotate(${rot} ${f(x)} ${f(y)})"/>`);
      else if (kind === 2) out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(k * 0.7)}" fill="none" stroke="${c}" stroke-width="${f(Math.max(MIN_LINE * 1.5, k / 4))}"/>`);
      else out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(k * 0.35)}" fill="${c}"/>`);
    }
    return out.join("");
  },
  stars(r, cols, n) {
    const out = [], count = Math.round(cols * cols * 0.8), sz = SIZE / cols;
    for (let i = 0; i < count; i++) {
      const x = r() * SIZE, y = r() * SIZE, R = sz * (0.2 + r() * 0.4), rot = r() * Math.PI;
      const pts = Array.from({ length: 10 }, (_, k) => { const a = rot + (k * Math.PI) / 5, rr = k % 2 ? R * 0.42 : R; return `${f(x + rr * Math.cos(a))},${f(y + rr * Math.sin(a))}`; }).join(" ");
      out.push(`<polygon points="${pts}" fill="${n(r)}"/>`);
    }
    return out.join("");
  },
  hex(r, cols, n) {
    const R = SIZE / (cols * 1.5) * 1.05, w = Math.sqrt(3) * R, gap = Math.max(MIN_LINE, R * 0.12);
    const out = [];
    for (let row = -1; row * R * 1.5 < SIZE + R; row++) {
      for (let col = -1; col * w < SIZE + w; col++) {
        if (r() < 0.12) continue; // a few empty cells keep it from reading as wallpaper
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * R * 1.5;
        const rr = R - gap / 2;
        const p = Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`; }).join(" ");
        out.push(`<polygon points="${p}" fill="${n(r)}"/>`);
      }
    }
    return out.join("");
  },
  cubes(r, cols, n, pal) {
    // isometric cubes: three faces in light, mid and dark of one palette pair
    const s = SIZE / cols, hgt = s * Math.sqrt(3) / 2, out = [];
    const faces = [pal[0], pal[1 % pal.length], pal[pal.length - 1]];
    for (let row = -1; row * s * 1.5 < SIZE + s; row++) {
      for (let col = -1; col * hgt * 2 < SIZE + hgt * 2; col++) {
        if (r() < 0.1) continue;
        const cx = col * hgt * 2 + (row % 2 ? hgt : 0), cy = row * s * 1.5;
        const top = [[cx, cy - s], [cx + hgt, cy - s / 2], [cx, cy], [cx - hgt, cy - s / 2]];
        const left = [[cx - hgt, cy - s / 2], [cx, cy], [cx, cy + s], [cx - hgt, cy + s / 2]];
        const right = [[cx + hgt, cy - s / 2], [cx, cy], [cx, cy + s], [cx + hgt, cy + s / 2]];
        const flip = r() < 0.5;
        out.push(poly(top, faces[0]), poly(left, flip ? faces[1] : faces[2]), poly(right, flip ? faces[2] : faces[1]));
      }
    }
    return out.join("");
  },
  tri(r, cols, n) {
    const s = SIZE / cols, hgt = s * Math.sqrt(3) / 2, out = [];
    for (let row = 0; row * hgt < SIZE + hgt; row++) {
      for (let col = -1; col * s < SIZE + s; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * hgt;
        if (r() > 0.1) out.push(poly([[x, y], [x + s, y], [x + s / 2, y + hgt]], n(r)));
        if (r() > 0.1) out.push(poly([[x + s / 2, y + hgt], [x + s * 1.5, y + hgt], [x + s, y]], n(r)));
      }
    }
    return out.join("");
  },
  truchet(r, cols, n, pal) {
    // quarter-circle tiles: thick arcs join up into circuit-like paths
    const s = SIZE / cols, wgt = Math.max(MIN_LINE * 2, s * 0.22), out = [];
    for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) {
      const x0 = x * s, y0 = y * s, c = pal[(x + y) % pal.length];
      const d = r() < 0.5
        ? `M${f(x0 + s / 2)} ${f(y0)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x0)} ${f(y0 + s / 2)} M${f(x0 + s)} ${f(y0 + s / 2)} A${f(s / 2)} ${f(s / 2)} 0 0 0 ${f(x0 + s / 2)} ${f(y0 + s)}`
        : `M${f(x0 + s / 2)} ${f(y0)} A${f(s / 2)} ${f(s / 2)} 0 0 0 ${f(x0 + s)} ${f(y0 + s / 2)} M${f(x0)} ${f(y0 + s / 2)} A${f(s / 2)} ${f(s / 2)} 0 0 1 ${f(x0 + s / 2)} ${f(y0 + s)}`;
      out.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="${f(wgt)}" stroke-linecap="round"/>`);
    }
    return out.join("");
  },
  rings(r, cols, n, pal) {
    // concentric bands around an off-center point, op-art style; the gaps between bands are see-through
    const bands = cols * 2, step = (SIZE * 0.75) / bands, ox = C + (r() - 0.5) * SIZE * 0.2, oy = C + (r() - 0.5) * SIZE * 0.2, out = [];
    const drift = r() < 0.5 ? step * 0.08 : 0;
    const circle = (cx, cy, rad) => `M${f(cx - rad)} ${f(cy)} a${f(rad)} ${f(rad)} 0 1 0 ${f(rad * 2)} 0 a${f(rad)} ${f(rad)} 0 1 0 ${f(-rad * 2)} 0Z`;
    for (let i = 0; i <= bands; i += 2) {
      const outer = (i + 1) * step, inner = i * step;
      const d = circle(ox + (i + 1) * drift, oy, outer) + (inner > 0 ? circle(ox + i * drift, oy, inner) : "");
      out.push(`<path d="${d}" fill-rule="evenodd" fill="${pal[(i / 2) % pal.length]}"/>`);
    }
    return out.join("");
  },
  burst(r, cols, n, pal) {
    const rays = cols * 4, ox = C, oy = C + (r() - 0.5) * SIZE * 0.3, rot = r() * Math.PI, out = [];
    for (let i = 0; i < rays; i += 2) {
      const a0 = rot + (i * 2 * Math.PI) / rays, a1 = rot + ((i + 1) * 2 * Math.PI) / rays, far = SIZE * 1.5;
      out.push(poly([[ox, oy], [ox + far * Math.cos(a0), oy + far * Math.sin(a0)], [ox + far * Math.cos(a1), oy + far * Math.sin(a1)]], pal[(i / 2) % pal.length]));
    }
    const hole = SIZE * (0.06 + r() * 0.08);
    out.push(`<circle cx="${f(ox)}" cy="${f(oy)}" r="${f(hole)}" fill="${pal[pal.length - 1]}"/>`);
    return out.join("");
  },
  shift(r, cols, n) {
    // squares drift and turn more toward the bottom, like a grid coming apart
    const s = SIZE / cols, out = [];
    for (let y = 0; y < cols; y++) for (let x = 0; x < cols; x++) {
      const k = y / Math.max(1, cols - 1), size = s * 0.78;
      const cx = x * s + s / 2 + (r() - 0.5) * s * 0.5 * k, cy = y * s + s / 2 + (r() - 0.5) * s * 0.5 * k;
      const rot = (r() - 0.5) * 70 * k;
      out.push(`<rect x="${f(cx - size / 2)}" y="${f(cy - size / 2)}" width="${f(size)}" height="${f(size)}" fill="${n(r)}" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"/>`);
    }
    return out.join("");
  },
  glitch(r, cols, n) {
    const rows = cols * 3, hgt = SIZE / rows, out = [];
    for (let y = 0; y < rows; y++) {
      let x = -r() * 120;
      while (x < SIZE) {
        const w = 40 + r() * 260;
        if (r() > 0.25) out.push(`<rect x="${f(x)}" y="${f(y * hgt + MIN_LINE / 2)}" width="${f(w)}" height="${f(Math.max(MIN_LINE, hgt - MIN_LINE))}" fill="${n(r)}"/>`);
        x += w + MIN_LINE + r() * 40;
      }
    }
    return out.join("");
  },
};

// Returns a complete standalone SVG document as a string.
export function generate(opts) {
  const o = normalize(opts);
  const r = rng(o.seed * 2654435761 + o.density);
  const pal = PALETTES.find((p) => p.id === o.palette).colors;
  const n = (rr) => pal[Math.floor(rr() * pal.length)];
  let art = STYLE_FNS[o.style](r, o.density, n, pal);
  const clip = outline(o.shape);
  // the id is unique per design, so several designs inlined in one page don't share a clip
  const id = `epx-${o.style}-${o.shape}-${o.seed.toString(36)}`;
  // styles can return a group marked data-cut: those shapes are cut out of the art with a mask
  const cut = art.match(/<g fill="#000" data-cut="1">([\s\S]*)<\/g>$/);
  if (cut) art = `<defs><mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><g fill="#000">${cut[1]}</g></mask></defs><g mask="url(#${id}-m)">${art.slice(0, cut.index)}</g>`;
  const body = clip
    ? `<defs><clipPath id="${id}">${clip}</clipPath></defs><g clip-path="url(#${id})">${art}</g>`
    : art;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}

const f = (v) => Math.round(v * 10) / 10;
const poly = (pts, fill) => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${fill}"/>`;

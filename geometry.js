// Epix3D pattern maker: seeded geometric art as SVG, ready to drop on a shirt.
// Pure functions, no DOM. Every design comes from (style, palette, shape, density, seed), so the same
// settings always give the same art and an order can be re-made from its name.
// Drawn on a 1000-unit square. Strokes and gaps stay at least 8 units (about 2 mm on a 10 in print)
// so nothing is too thin for DTF, and every fill is solid (no see-through pixels).

export const SIZE = 1000;
const MIN_LINE = 8;

export const STYLES = [
  ["hex", "Hex grid"], ["cubes", "3D cubes"], ["tri", "Triangles"], ["truchet", "Circuit"],
  ["rings", "Op rings"], ["burst", "Burst"], ["shift", "Shifted squares"], ["glitch", "Glitch bars"],
];
export const SHAPES = [["circle", "Circle"], ["hex", "Hexagon"], ["square", "Square"], ["diamond", "Diamond"], ["shield", "Shield"], ["none", "Full"]];
// `on`: the shirt shade a palette reads best on, used to pick a sensible default.
export const PALETTES = [
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
  const art = STYLE_FNS[o.style](r, o.density, n, pal);
  const clip = outline(o.shape);
  // the id is unique per design, so several designs inlined in one page don't share a clip
  const id = `epx-${o.style}-${o.shape}-${o.seed.toString(36)}`;
  const body = clip
    ? `<defs><clipPath id="${id}">${clip}</clipPath></defs><g clip-path="url(#${id})">${art}</g>`
    : art;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">${body}</svg>`;
}

const f = (v) => Math.round(v * 10) / 10;
const poly = (pts, fill) => `<polygon points="${pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ")}" fill="${fill}"/>`;

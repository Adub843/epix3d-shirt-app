// Shirt builder (Epix3D edition of the Elevated Designs builder): blank picker, pattern maker, art library,
// upload cleanup, layer editor and add-to-cart. Everything runs in the browser. Print files are rendered at
// 300 DPI and handed to the Elevated Designs Shopify cart as file properties, so the order carries them; the
// price always comes from the Shopify variant. Brand-specific settings live in index.html (data-sb-config).

const root = document.querySelector("[data-shirt-builder]");
const cfgEl = document.querySelector("[data-sb-config]");
if (root && cfgEl) start(JSON.parse(cfgEl.textContent)).catch((e) => {
  console.error(e);
  root.innerHTML = '<p class="wrap sb-error">Sorry, the shirt builder could not load. Please refresh the page.</p>';
});

const DPI = 300;
const MAX_SRC = 4800; // longest side kept for any source image
const MAX_PX = 12e6; // pixel cap for any working image or canvas; iOS Safari refuses canvases over 16.7M
const PREVIEW = 1200; // longest side used while editing
const FONTS = [
  ["Inter", "Inter:wght@700"], ["Fraunces", "Fraunces:wght@700"], ["Bebas Neue", "Bebas+Neue"], ["Anton", "Anton"],
  ["Oswald", "Oswald:wght@600"], ["Permanent Marker", "Permanent+Marker"], ["Pacifico", "Pacifico"],
  ["Lobster", "Lobster"], ["Bungee", "Bungee"], ["Courier Prime", "Courier+Prime:wght@700"],
];
const KNOWN_COLORS = {
  white: "#f6f6f4", black: "#1b1b1d", navy: "#1f2a44", "heather grey": "#a9abae", "heather gray": "#a9abae",
  "sport grey": "#9b9ea3", "dark heather": "#4a4c50", charcoal: "#3d3f43", red: "#b3262e", cardinal: "#8a1f2c",
  maroon: "#5b1f2a", "forest green": "#2f4a34", forest: "#2f4a34", "military green": "#5b5f3f", "irish green": "#1f9a4e",
  royal: "#2a4fa0", "royal blue": "#2a4fa0", "carolina blue": "#7ba7d6", "light blue": "#a9c8e6", sapphire: "#0f78b8",
  purple: "#4b2e83", orange: "#e5662a", gold: "#f2a900", "safety green": "#c7e43b", yellow: "#f4d84b", daisy: "#f5d547",
  pink: "#f2a7bd", "light pink": "#f6cad6", sand: "#d9c7a3", natural: "#ece3d0", tan: "#c9b08a", brown: "#5a3e2b",
  "ash": "#d6d6d3", "ice grey": "#cfd1d0", pepper: "#57575a", "true navy": "#24304a", "blue jean": "#5c7591",
  "ivory": "#f2ecdc", "seafoam": "#8ec9b0", "mint": "#bfe3cc", "chalky mint": "#9fd6c2", "butter": "#f3e3a2",
};

async function start(cfg) {
  const img = await import(cfg.imagingUrl);
  const geo = cfg.geometryUrl ? await import(cfg.geometryUrl) : null; // pattern maker (Explore tab)
  const fonts = Array.isArray(cfg.fonts) && cfg.fonts.length ? cfg.fonts : FONTS;
  const textFont = fonts.find((f) => f[0] === cfg.textFont)?.[0] ?? fonts[Math.min(2, fonts.length - 1)][0];
  const idPrefix = String(cfg.designIdPrefix || "ED").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4) || "ED";
  const store = (cfg.storeUrl || "").replace(/\/+$/, "");
  cfg.cartUrl ??= `${store}/cart`;
  cfg.cartAddUrl ??= `${store}/cart/add.js`;
  if (cfg.catalogUrl && !cfg.blanks) {
    const res = await fetch(cfg.catalogUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error("catalog");
    cfg.blanks = (await res.json()).blanks;
  }
  // Same site as the store (or a test harness): add with fetch. Otherwise hand off with a real form post.
  const crossSite = !!store && new URL(store).origin !== location.origin;
  const minPrice = (b) => Math.min(...b.variants.map((v) => v.price));
  // Cheapest first, so a lower-priced shirt is always easy to find.
  const blanks = (cfg.blanks ?? []).filter((b) => b.variants?.length).sort((a, b) => minPrice(a) - minPrice(b));
  const TYPE_NAMES = { tee: "T-shirts", "long-sleeve": "Long sleeve", tank: "Tanks", womens: "Women's", youth: "Youth", crewneck: "Crewnecks", hoodie: "Hoodies" };
  const TIER_NAMES = { value: "Best price", standard: "Soft and fitted", premium: "Premium" };
  const types = [...new Set(blanks.map((b) => b.type ?? "other"))].sort((a, b) => Object.keys(TYPE_NAMES).indexOf(a) - Object.keys(TYPE_NAMES).indexOf(b));
  const colorHex = { ...KNOWN_COLORS, ...parseHexList(cfg.colorHex) };
  const money = new Intl.NumberFormat(undefined, { style: "currency", currency: cfg.currency || "USD" });
  const libBase = (cfg.libraryUrl || "").replace(/\/+$/, "");
  const qrSource = (new URLSearchParams(location.search).get("src") ?? "").replace(/[^\w-]/g, "").slice(0, 40);
  const PW = Number(cfg.printWidthIn) || 12, PH = Number(cfg.printHeightIn) || 16;

  // ---------- state ----------
  const sources = new Map(); // id -> { full: ImageData, preview: ImageData, file?: File, name, from }
  const rendered = new Map(); // layer id -> { key, canvas }
  let uid = 0;
  const S = {
    blank: 0, type: "tee", color: null, size: null, qty: 1, side: "front", sel: null,
    layers: { front: [], back: [] },
  };
  S.blank = Math.max(0, blanks.findIndex((b) => (b.type ?? "tee") === "tee")); // start on the cheapest adult tee
  const history = { past: [], future: [] };
  const snapshot = () => JSON.stringify({ layers: S.layers, color: S.color, blank: S.blank });
  const commit = () => { history.past.push(snapshot()); if (history.past.length > 60) history.past.shift(); history.future.length = 0; syncUndo(); };
  const restore = (snap) => { const o = JSON.parse(snap); S.layers = o.layers; S.color = o.color; S.blank = o.blank; S.sel = null; drawAll(); };

  // ---------- dom helpers ----------
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "class") n.className = v;
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : String(k));
    return n;
  };
  // replaceChildren() would print a skipped (null) child as the word "null", so drop those first.
  const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const say = (msg, kind = "") => { status.textContent = msg; status.className = `sb-status ${kind}`; };
  const busy = async (msg, fn) => {
    say(msg, "busy"); root.classList.add("is-busy");
    await new Promise((r) => setTimeout(r, 30)); // let the message paint before heavy work
    try { return await fn(); } finally { root.classList.remove("is-busy"); }
  };
  const range = (label, min, max, step, value, oninput) => {
    const out = h("output", {}, value);
    const inp = h("input", { type: "range", min, max, step, value, "aria-label": label });
    inp.addEventListener("input", () => { out.textContent = inp.value; oninput(Number(inp.value), false); });
    inp.addEventListener("change", () => oninput(Number(inp.value), true));
    return { el: h("label", { class: "sb-range" }, h("span", {}, label), inp, out), inp, out };
  };

  // ---------- layout ----------
  const status = h("p", { class: "sb-status", role: "status", "aria-live": "polite" });
  const shirt = h("div", { class: "sb-shirt" });
  const area = h("div", { class: "sb-area", tabindex: "0", "aria-label": "Print area. Arrow keys move the selected art." });
  const stage = h("div", { class: "sb-stage" }, shirt, area);
  const sideBtns = h("div", { class: "sb-seg", role: "tablist", "aria-label": "Shirt side" });
  const undoBtn = h("button", { type: "button", class: "btn ghost small", onclick: () => undo(), disabled: true }, "Undo");
  const redoBtn = h("button", { type: "button", class: "btn ghost small", onclick: () => redo(), disabled: true }, "Redo");
  const guideChk = h("input", { type: "checkbox", checked: true, onchange: () => area.classList.toggle("no-guide", !guideChk.checked) });
  const sizeLine = h("p", { class: "sb-size small" });

  const tabs = ["Shirt", ...(geo ? ["Explore"] : []), "Library", "Upload", "Text", "Edit", "Order"];
  const panels = Object.fromEntries(tabs.map((t) => [t, h("section", { class: "sb-panel", id: `sb-p-${t}`, role: "tabpanel", hidden: t !== "Shirt" })]));
  const tabBar = h("div", { class: "sb-tabs", role: "tablist", style: `--sb-tabs:${tabs.length}` }, tabs.map((t, i) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(i === 0), "aria-controls": `sb-p-${t}`, onclick: () => showTab(t) }, t)));
  const showTab = (t) => {
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== t;
    for (const b of tabBar.children) b.setAttribute("aria-selected", String(b.textContent === t));
    if (t === "Order") drawOrder();
    if (t === "Edit") drawEdit();
    if (t === "Explore") drawExplore();
  };

  put(root, h("div", { class: "wrap sb-wrap" },
    h("header", { class: "sb-head" }, h("h1", { class: "page-title" }, cfg.heading || "Build your shirt"), cfg.note ? h("p", { class: "muted" }, cfg.note) : null),
    h("div", { class: "sb-grid" },
      h("div", { class: "sb-left" },
        h("div", { class: "sb-toolbar" }, sideBtns, h("span", { class: "sb-spacer" }), undoBtn, redoBtn,
          h("label", { class: "sb-check small" }, guideChk, " Print area")),
        stage, sizeLine, status),
      h("div", { class: "sb-right" }, tabBar, ...Object.values(panels)))));

  // ---------- shirt ----------
  const blank = () => blanks[S.blank];
  const colorsOf = (b) => b ? [...new Set(b.variants.map((v) => v.options[b.colorIndex - 1]).filter(Boolean))] : [];
  const sizesOf = (b, color) => b ? b.variants.filter((v) => !b.colorIndex || v.options[b.colorIndex - 1] === color)
    .map((v) => ({ size: v.options.filter((_, i) => i !== b.colorIndex - 1).join(" / ") || "One size", v })) : [];
  const variant = () => { const b = blank(); return sizesOf(b, S.color).find((x) => x.size === S.size)?.v ?? null; };
  const hexFor = (name) => blank()?.colorHex?.[name] ?? colorHex[String(name ?? "").toLowerCase().trim()] ?? hashGray(name);

  function drawShirt() {
    const fill = hexFor(S.color);
    shirt.innerHTML = shirtSvg(fill, S.side);
    stage.style.setProperty("--sb-ink", isDark(fill) ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.35)");
  }

  function drawShirtPanel() {
    const p = panels.Shirt;
    if (!blanks.length) { put(p, h("h2", { class: "sb-h" }, "Shirts are being restocked"), h("p", { class: "muted" }, "Check back soon, or shop our ready-made tees in the meantime."), h("a", { class: "btn full", href: store || "https://elevatedshirts.com" }, "Shop ready-made tees")); return; }
    S.type = blank().type ?? "other"; // follows the shirt, so undo and type tabs always agree
    const shown = blanks.map((bl, i) => ({ bl, i })).filter(({ bl }) => (bl.type ?? "other") === S.type);
    const b = blank();
    if (!S.color || !colorsOf(b).includes(S.color)) S.color = colorsOf(b)[0] ?? null;
    const sizes = sizesOf(b, S.color);
    if (!sizes.some((x) => x.size === S.size && x.v.available)) S.size = sizes.find((x) => x.v.available)?.size ?? null;
    const v = variant();
    put(p, 
      h("h2", { class: "sb-h" }, "Shirt"),
      types.length > 1 ? h("div", { class: "sb-types", role: "tablist", "aria-label": "Garment type" }, types.map((t) =>
        h("button", { type: "button", role: "tab", "aria-selected": String(t === S.type), class: "sb-pill",
          onclick: () => { S.blank = blanks.findIndex((bl) => (bl.type ?? "other") === t); drawShirtPanel(); drawShirt(); } },
          TYPE_NAMES[t] ?? "Other"))) : null,
      h("p", { class: "muted small" }, "Cheapest first. Every shirt prints the same way, so pick the feel and price you like."),
      h("div", { class: "sb-blanks", role: "radiogroup", "aria-label": "Shirt style" }, shown.map(({ bl, i }) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(i === S.blank), class: "sb-blank",
          onclick: () => { S.blank = i; drawShirtPanel(); drawShirt(); } },
          bl.image ? h("img", { src: bl.image, alt: "", loading: "lazy", width: 80, height: 80 }) : null,
          h("span", {}, h("strong", {}, bl.title.replace(/^Custom\s+/i, "")),
            h("small", { class: "muted" }, [bl.vendor, TIER_NAMES[bl.tier], bl.fabric].filter(Boolean).join(" · "))),
          h("span", { class: "sb-from" }, h("small", { class: "muted" }, "from"), money.format(minPrice(bl) / 100))))),
      h("h3", { class: "sb-h3" }, "Color", h("span", { class: "muted" }, ` ${S.color ?? ""}`)),
      h("div", { class: "sb-swatches", role: "radiogroup", "aria-label": "Shirt color" }, colorsOf(b).map((c) => {
        const any = b.variants.some((x) => x.options[b.colorIndex - 1] === c && x.available);
        return h("button", { type: "button", role: "radio", "aria-checked": String(c === S.color), title: any ? c : `${c} (sold out)`,
          "aria-label": c, disabled: !any, style: `--sw:${hexFor(c)}`, class: "sb-sw", onclick: () => { S.color = c; drawShirtPanel(); drawShirt(); } });
      })),
      h("h3", { class: "sb-h3" }, "Size"),
      h("div", { class: "sb-sizes", role: "radiogroup", "aria-label": "Size" }, sizes.map(({ size, v: sv }) =>
        h("button", { type: "button", role: "radio", "aria-checked": String(size === S.size), disabled: !sv.available,
          class: "sb-pill", onclick: () => { S.size = size; drawShirtPanel(); } }, size,
          h("small", {}, money.format(sv.price / 100))))),
      h("p", { class: "sb-price" }, v ? money.format(v.price / 100) : "Pick a size", v ? h("span", { class: "muted small" }, " each, printed") : null),
      b.description ? h("p", { class: "muted small" }, b.description) : null,
    );
  }

  // ---------- sides ----------
  function drawSides() {
    put(sideBtns, ...["front", "back"].map((s) => h("button", { type: "button", role: "tab", "aria-selected": String(S.side === s), class: "sb-pill",
      onclick: () => { S.side = s; S.sel = null; drawAll(); } }, s === "front" ? "Front" : "Back", S.layers[s].length ? h("small", {}, ` ${S.layers[s].length}`) : null)));
  }

  // ---------- layers on the stage ----------
  const layers = () => S.layers[S.side];
  const selLayer = () => layers().find((l) => l.id === S.sel) ?? null;
  const ppi = () => area.clientWidth / PW;

  function drawStage() {
    const scale = ppi();
    area.style.aspectRatio = `${PW} / ${PH}`;
    const els = layers().map((l) => {
      const c = canvasFor(l);
      const node = h("div", { class: `sb-layer${l.id === S.sel ? " sel" : ""}${l.locked ? " locked" : ""}`, "data-id": l.id });
      node.style.cssText = `left:${(l.x - l.w / 2) * scale}px;top:${(l.y - l.h / 2) * scale}px;width:${l.w * scale}px;height:${l.h * scale}px;` +
        `transform:rotate(${l.rot}deg) scale(${l.flipX ? -1 : 1},${l.flipY ? -1 : 1})`;
      if (c) { c.classList.add("sb-bmp"); node.append(c); }
      if (l.id === S.sel && !l.locked) node.append(h("span", { class: "sb-h-scale", "data-handle": "scale", "aria-hidden": "true" }), h("span", { class: "sb-h-rot", "data-handle": "rot", "aria-hidden": "true" }));
      return node;
    });
    put(area, ...els);
    drawSizeLine();
  }

  function drawSizeLine() {
    const l = selLayer();
    if (!l) { const bb = boundsOf(layers()); sizeLine.textContent = bb ? `Design on the ${S.side}: ${fmtIn(bb.w)} wide × ${fmtIn(bb.h)} tall` : "Tap Library, Upload or Text to add art."; return; }
    const off = outside([l]) ? " · part is outside the print area and won't print" : "";
    const src = l.type === "image" ? sources.get(l.src) : null;
    const st = src ? img.printStats(src.full.width * cropFrac(l).w, src.full.height * cropFrac(l).h, l.w, l.h) : null;
    put(sizeLine, `${l.name}: ${fmtIn(l.w)} × ${fmtIn(l.h)}`,
      st ? h("span", { class: `sb-dpi ${st.level}` }, ` · ${Math.round(st.dpi)} DPI ${st.level === "good" ? "✓ sharp" : st.level === "ok" ? "· may look soft" : "· too small, will print blurry"}`) : null, off ? h("span", { class: "sb-dpi low" }, off) : null);
  }

  // pointer: drag to move, handles to scale and rotate
  let drag = null;
  area.addEventListener("pointerdown", (e) => {
    const node = e.target.closest(".sb-layer");
    if (!node) { if (S.sel) { S.sel = null; drawStage(); } return; }
    const l = layers().find((x) => x.id === node.dataset.id);
    if (!l) return;
    if (S.sel !== l.id) { S.sel = l.id; drawStage(); if (!panels.Edit.hidden) drawEdit(); }
    if (l.locked) return;
    e.preventDefault();
    area.setPointerCapture(e.pointerId);
    const r = area.getBoundingClientRect(), s = ppi();
    drag = { l, mode: e.target.dataset.handle ?? "move", sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, w: l.w, h: l.h, rot: l.rot,
      cx: r.left + l.x * s, cy: r.top + l.y * s, s, moved: false };
  });
  area.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const { l, s } = drag;
    const dx = (e.clientX - drag.sx) / s, dy = (e.clientY - drag.sy) / s;
    if (Math.abs(dx) + Math.abs(dy) > 0.02) drag.moved = true;
    if (drag.mode === "move") {
      l.x = snap(drag.x + dx, PW / 2); l.y = drag.y + dy;
    } else if (drag.mode === "scale") {
      const d0 = Math.hypot(drag.sx - drag.cx, drag.sy - drag.cy), d1 = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
      const k = Math.max(0.05, d1 / Math.max(d0, 1));
      l.w = clamp(drag.w * k, 0.25, PW * 1.5); l.h = l.aspectLock !== false ? l.w * (drag.h / drag.w) : clamp(drag.h * k, 0.25, PH * 1.5);
    } else {
      const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180 / Math.PI + 90;
      l.rot = Math.round(e.shiftKey ? a : snapAngle(a));
    }
    drawStage();
  });
  const endDrag = () => { if (drag?.moved) commit(); drag = null; };
  area.addEventListener("pointerup", endDrag);
  area.addEventListener("pointercancel", endDrag);
  area.addEventListener("keydown", (e) => {
    const l = selLayer();
    if (!l || l.locked) return;
    const step = e.shiftKey ? 1 : 0.1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); l.x += moves[e.key][0]; l.y += moves[e.key][1]; drawStage(); commitSoon(); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeLayer(l); }
  });
  let commitTimer;
  const commitSoon = () => { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 400); };
  new ResizeObserver(() => drawStage()).observe(area);

  // ---------- adding layers ----------
  function addImageLayer(srcId, name) {
    const src = sources.get(srcId);
    const ar = src.full.height / src.full.width;
    let w = Math.min(PW * 0.8, (src.full.width / DPI) * 1.0 || PW * 0.6);
    w = clamp(w, Math.min(4, PW * 0.6), PW * 0.8);
    let hgt = w * ar;
    if (hgt > PH * 0.8) { hgt = PH * 0.8; w = hgt / ar; }
    const l = { id: `L${++uid}`, type: "image", src: srcId, name, x: PW / 2, y: Math.min(PH / 2, hgt / 2 + 1), w, h: hgt,
      rot: 0, flipX: false, flipY: false, opacity: 100, locked: false, aspectLock: true, ops: {}, crop: null };
    layers().push(l); S.sel = l.id; commit(); drawAll();
    say(`Added ${name}. Drag to move, use the corner to resize.`);
    if (window.matchMedia("(max-width: 900px)").matches) stage.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function addTextLayer() {
    const l = { id: `L${++uid}`, type: "text", name: "Text", x: PW / 2, y: 3, w: PW * 0.7, h: 2, rot: 0, flipX: false, flipY: false,
      opacity: 100, locked: false, aspectLock: true,
      text: { value: "Your text", font: textFont, color: isDark(hexFor(S.color)) ? "#ffffff" : "#111111", outline: "#000000", outlineW: 0, spacing: 0, curve: 0, align: "center" } };
    layers().push(l); S.sel = l.id; fitTextBox(l); commit(); drawAll(); showTab("Edit");
  }
  function removeLayer(l) {
    S.layers[S.side] = layers().filter((x) => x !== l); rendered.delete(l.id); S.sel = null; commit(); drawAll();
  }

  // ---------- rendering a layer's bitmap ----------
  function canvasFor(l) {
    const key = l.type === "text" ? JSON.stringify(l.text) : `${l.src}|${JSON.stringify(l.ops)}|${JSON.stringify(l.crop)}|${l.ops.knockout ? S.color : ""}`;
    const hit = rendered.get(l.id);
    if (hit?.key === key) return hit.canvas;
    const canvas = l.type === "text" ? renderText(l.text, 160) : toCanvas(process(sources.get(l.src).preview, l.ops, l.crop, 1));
    rendered.set(l.id, { key, canvas });
    return canvas;
  }

  // the edit pipeline, in a fixed order so results are repeatable
  function process(base, ops, crop, scale) {
    let im = crop ? cropImage(base, crop) : base;
    // k = this copy's size relative to the preview, so pixel-based effects match what the customer saw
    const prev = [...sources.values()].find((s) => s.preview === base || s.full === base);
    let k = prev ? base.width / prev.preview.width : 1;
    if (ops.upscale > 1 && scale === "full") {
      const f = Math.min(ops.upscale, Math.max(1, Math.floor(Math.sqrt(MAX_PX / (im.width * im.height)))));
      if (f > 1) { im = img.upscale(im, f); k *= f; }
    }
    if (ops.denoise) im = img.denoise(im, Math.max(1, Math.round(k)));
    // background first: then the gaps between halftone dots are transparent and descreen fills them solid
    if (ops.bg) im = img.removeBackground(im, { tolerance: ops.bgTol ?? 30, contiguous: ops.bgAll ? false : true, color: ops.bgColor ?? null, feather: Math.max(1, Math.round(k)) });
    if (ops.descreen) im = img.descreen(im, { strength: ops.descreen, scale: k });
    if (ops.enhance) im = img.unsharp(img.autoLevels(im), { amount: 0.5, radius: Math.max(1, Math.round(k)) });
    if (ops.brightness || ops.contrast || ops.saturation || ops.hue) im = img.adjust(im, { brightness: ops.brightness ?? 0, contrast: ops.contrast ?? 0, saturation: ops.saturation ?? 0, hue: ops.hue ?? 0 });
    if (ops.grayscale) im = img.grayscale(im);
    if (ops.invert) im = img.invert(im);
    if (ops.replaceFrom && ops.replaceTo) im = img.replaceColor(im, hexRgb(ops.replaceFrom), hexRgb(ops.replaceTo), ops.replaceTol ?? 40);
    if (ops.solid) im = img.recolorSolid(im, hexRgb(ops.solid));
    if (ops.dtf) im = img.dtfPrep(im, { threshold: 128, choke: Math.max(1, Math.round(k)), knockout: ops.knockout ? hexRgb(hexFor(S.color)) : null }).image;
    return im;
  }

  // ---------- text ----------
  function renderText(t, px) {
    const c = document.createElement("canvas"), ctx = c.getContext("2d");
    const font = `${px}px "${t.font}", system-ui, sans-serif`;
    ctx.font = font;
    const lines = String(t.value || " ").split("\n");
    const sp = (t.spacing ?? 0) * px / 100;
    const widthOf = (s) => [...s].reduce((a, ch) => a + ctx.measureText(ch).width + sp, 0) - sp;
    const pad = Math.ceil(px * 0.25 + (t.outlineW ?? 0) * px / 50);
    const lh = px * 1.15;
    const maxW = Math.max(...lines.map(widthOf), 1);
    const curve = (t.curve ?? 0) / 100;
    let W = Math.ceil(maxW + pad * 2), H = Math.ceil(lh * lines.length + pad * 2);
    if (curve) { H += Math.ceil(Math.abs(curve) * maxW * 0.35); }
    c.width = W; c.height = H;
    ctx.font = font; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.fillStyle = t.color; ctx.strokeStyle = t.outline; ctx.lineWidth = (t.outlineW ?? 0) * px / 25;
    lines.forEach((line, li) => {
      const lw = widthOf(line);
      let x = t.align === "left" ? pad : t.align === "right" ? W - pad - lw : (W - lw) / 2;
      const baseY = pad + lh * (li + 0.5) + (curve > 0 ? Math.abs(curve) * maxW * 0.35 : 0);
      for (const ch of line) {
        const cw = ctx.measureText(ch).width;
        const mid = x + cw / 2;
        const rel = (mid - W / 2) / (maxW / 2 || 1); // -1..1 across the line
        const dy = -curve * maxW * 0.35 * (1 - rel * rel);
        const ang = curve * rel * 0.7;
        ctx.save(); ctx.translate(mid, baseY + dy); ctx.rotate(ang);
        if (ctx.lineWidth > 0) ctx.strokeText(ch, -cw / 2, 0);
        ctx.fillText(ch, -cw / 2, 0);
        ctx.restore();
        x += cw + sp;
      }
    });
    return trimCanvas(c);
  }
  function fitTextBox(l) {
    const c = renderText(l.text, 160);
    l.h = l.w * (c.height / c.width);
    if (l.h > PH * 0.9) { l.h = PH * 0.9; l.w = l.h * (c.width / c.height); }
  }
  const loadFont = async (name) => {
    const f = fonts.find((x) => x[0] === name);
    if (f?.[1] && !document.querySelector(`link[data-font="${f[1]}"]`)) {
      document.head.append(h("link", { rel: "stylesheet", "data-font": f[1], href: `https://fonts.googleapis.com/css2?family=${f[1]}&display=swap` }));
    }
    try { await document.fonts.load(`80px "${name}"`); } catch { /* fall back to system font */ }
  };

  // ---------- library ----------
  const lib = { items: [], q: "", cat: "", kind: "", shown: 60, loaded: false, error: "" };
  // Art this app features first (by category or tag). "All categories" still shows everything.
  const focusWords = (cfg.libraryFocus ?? []).map((w) => String(w).toLowerCase().trim()).filter(Boolean);
  const FOCUS = "__focus";
  const isFocus = (i) => focusWords.some((w) => String(i.category ?? "").toLowerCase() === w ||
    String(i.tags ?? "").toLowerCase().split(/[,;]\s*|\s+/).includes(w));
  async function loadLibrary() {
    if (!libBase) { lib.error = "The art library isn't connected yet."; lib.loaded = true; return; }
    try {
      const res = await fetch(`${libBase}/api/images?public=1`, { headers: { accept: "application/json" }, mode: "cors" });
      if (!res.ok) throw new Error(res.statusText);
      lib.items = ((await res.json()).items ?? []).filter((i) => i.public !== false);
      if (lib.items.some(isFocus)) lib.cat = FOCUS;
    } catch { lib.error = "The art library couldn't load. You can still upload your own art."; }
    lib.loaded = true;
  }
  const libUrl = (i) => `${libBase}/api/images/${encodeURIComponent(i.key)}`;
  function drawLibrary() {
    const p = panels.Library;
    if (!lib.loaded) { put(p, h("p", { class: "muted" }, "Loading art…")); return; }
    const q = lib.q.toLowerCase().trim();
    const cats = [...new Set(lib.items.map((i) => i.category).filter(Boolean))].sort();
    const shown = lib.items.filter((i) => (!lib.cat || (lib.cat === FOCUS ? isFocus(i) : i.category === lib.cat)) && (!lib.kind || kindOf(i) === lib.kind) &&
      (!q || q.split(/\s+/).every((w) => `${i.name ?? ""} ${i.tags ?? ""} ${i.category ?? ""}`.toLowerCase().includes(w))));
    const search = h("input", { class: "field", type: "search", placeholder: cfg.librarySearchHint || "Search art, e.g. anchor, pineapple, Christmas", value: lib.q, "aria-label": "Search art" });
    search.addEventListener("input", debounce(() => { lib.q = search.value; lib.shown = 60; drawLibrary(); panels.Library.querySelector("input[type=search]")?.focus(); }, 250));
    const sel = (label, val, opts, on) => h("select", { class: "field", "aria-label": label, onchange: (e) => on(e.target.value) },
      h("option", { value: "" }, label), opts.map(([v, t]) => h("option", { value: v, selected: v === val }, t)));
    put(p, 
      h("h2", { class: "sb-h" }, "Art library"),
      lib.error ? h("p", { class: "sb-note" }, lib.error) : null,
      h("div", { class: "sb-filters" }, search,
        sel("All categories", lib.cat, [...(lib.items.some(isFocus) ? [[FOCUS, cfg.libraryFocusLabel || "Featured"]] : []), ...cats.map((c) => [c, c])], (v) => { lib.cat = v; lib.shown = 60; drawLibrary(); }),
        sel("All types", lib.kind, [["svg", "SVG"], ["png", "PNG"], ["dtf", "DTF-ready"]], (v) => { lib.kind = v; lib.shown = 60; drawLibrary(); })),
      h("p", { class: "muted small" }, `${shown.length} designs`),
      h("div", { class: "sb-lib", role: "list" }, shown.slice(0, lib.shown).map((i) =>
        h("button", { type: "button", role: "listitem", class: "sb-tile", title: `${i.name ?? "Design"}${i.tags ? ` · ${i.tags}` : ""}`,
          onclick: () => addFromLibrary(i) },
          h("img", { src: libUrl(i), alt: i.name ?? "Design", loading: "lazy", decoding: "async", crossorigin: "anonymous" }),
          kindOf(i) === "dtf" ? h("span", { class: "sb-badge" }, "DTF") : null))),
      shown.length > lib.shown ? h("button", { type: "button", class: "btn ghost full", onclick: () => { lib.shown += 60; drawLibrary(); } }, "Show more") : null,
    );
  }
  async function addFromLibrary(i) {
    await busy("Adding art…", async () => {
      const res = await fetch(libUrl(i), { mode: "cors" });
      if (!res.ok) throw new Error("That design couldn't load.");
      const blobIn = await res.blob();
      const id = await addSource(blobIn, i.name ?? "Library art", "library", null);
      addImageLayer(id, i.name ?? "Library art");
    }).catch((e) => say(e.message, "err"));
  }

  // ---------- explore: pattern maker ----------
  const ex = geo ? { ...geo.randomize(), palette: geo.defaultPalette(isDark(hexFor(S.color))) } : null;
  let exUrl = "";
  const exName = () => `${geo.STYLES.find(([k]) => k === ex.style)[1]} · ${geo.PALETTES.find((x) => x.id === ex.palette).name}`;
  function drawExplore() {
    if (!geo) return;
    if (exUrl) URL.revokeObjectURL(exUrl);
    exUrl = URL.createObjectURL(new Blob([geo.generate(ex)], { type: "image/svg+xml" }));
    const set = (k, v) => { ex[k] = v; drawExplore(); };
    const pills = (label, list, key) => h("div", { class: "sb-btnrow", role: "radiogroup", "aria-label": label }, list.map(([k, name]) =>
      h("button", { type: "button", role: "radio", class: "sb-pill", "aria-checked": String(k === ex[key]), onclick: () => set(key, k) }, name)));
    put(panels.Explore,
      h("h2", { class: "sb-h" }, "Explore"),
      h("p", { class: "muted small" }, "Make a one-of-a-kind geometric design. Shuffle until you love it, then add it to your shirt."),
      h("div", { class: "sb-explore", style: `--sb-shirt:${hexFor(S.color)}` },
        h("img", { src: exUrl, alt: `${exName()} pattern preview`, width: 360, height: 360 })),
      h("div", { class: "sb-btnrow sb-explore-go" },
        h("button", { type: "button", class: "btn", onclick: () => set("seed", geo.newSeed()) }, "Shuffle"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(ex, geo.randomize()); drawExplore(); } }, "Surprise me"),
        h("button", { type: "button", class: "btn brass", onclick: () => addPattern() }, "Add to shirt")),
      h("h3", { class: "sb-h3" }, "Style"), pills("Pattern style", geo.STYLES, "style"),
      h("h3", { class: "sb-h3" }, "Colors"),
      h("div", { class: "sb-pals", role: "radiogroup", "aria-label": "Pattern colors" }, geo.PALETTES.map((pl) =>
        h("button", { type: "button", role: "radio", class: "sb-pal", "aria-checked": String(pl.id === ex.palette), onclick: () => set("palette", pl.id) },
          h("span", { class: "sb-pal-sw", "aria-hidden": "true" }, pl.colors.map((c) => h("i", { style: `background:${c}` }))), pl.name))),
      h("h3", { class: "sb-h3" }, "Shape"), pills("Pattern shape", geo.SHAPES, "shape"),
      range("Detail", 3, 12, 1, ex.density, (v, done) => { if (done) set("density", v); }).el,
      h("p", { class: "muted small" }, "Design code ", h("code", {}, geo.codeOf(ex)), ". Tip: after adding, use Edit to recolor it or make it one color."),
    );
  }
  async function addPattern() {
    const name = exName(), code = geo.codeOf(ex);
    await busy("Adding your design…", async () => {
      const id = await addSource(new Blob([geo.generate(ex)], { type: "image/svg+xml" }), name, "explore", null);
      sources.get(id).code = code;
      addImageLayer(id, name);
    }).catch((e) => say(e.message || "That design couldn't be added.", "err"));
  }

  // ---------- upload ----------
  function drawUpload() {
    const fileIn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", hidden: true });
    const dropZone = h("div", { class: "sb-drop" },
      h("p", {}, h("strong", {}, "Upload your art")), h("p", { class: "muted small" }, `PNG, JPG, WebP or SVG, up to ${cfg.maxUploadMb} MB. Bigger and sharper prints better.`),
      h("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, "Choose a file"));
    const take = (f) => f && handleUpload(f);
    fileIn.addEventListener("change", () => take(fileIn.files[0]));
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
    dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.classList.remove("over"); take(e.dataTransfer.files[0]); });
    put(panels.Upload, h("h2", { class: "sb-h" }, "Upload"), dropZone, fileIn,
      h("p", { class: "muted small" }, "After you add it, open Edit to remove the background, clean up halftone dots, sharpen it and get it ready for DTF printing."),
      h("p", { class: "muted small" }, "Only upload art you have the right to print."));
  }
  async function handleUpload(file) {
    const okTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!okTypes.includes(file.type)) return say("That file type isn't supported. Use PNG, JPG, WebP or SVG.", "err");
    if (file.size > cfg.maxUploadMb * 1024 * 1024) return say(`That file is over ${cfg.maxUploadMb} MB. Please use a smaller one.`, "err");
    if (!(await sniffImage(file))) return say("That file doesn't look like a real image.", "err");
    await busy("Reading your image…", async () => {
      const id = await addSource(file, file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Upload", "upload", file);
      addImageLayer(id, "Your upload");
      const l = selLayer();
      const st = img.printStats(sources.get(id).full.width, sources.get(id).full.height, l.w, l.h);
      if (st.level !== "good") say(`Heads up: this image is ${Math.round(st.dpi)} DPI at this size. Try Edit → Upscale, or print it smaller.`, "warn");
      showTab("Edit");
    }).catch((e) => say(e.message || "That image couldn't be read.", "err"));
  }
  async function addSource(blobIn, name, from, file) {
    const full = await decode(blobIn, MAX_SRC);
    const preview = full.width > PREVIEW || full.height > PREVIEW ? downscale(full, PREVIEW) : full;
    const id = `S${++uid}`;
    sources.set(id, { full, preview, name, from, file });
    return id;
  }

  // ---------- edit ----------
  function drawEdit() {
    const p = panels.Edit;
    const l = selLayer();
    if (!l) { put(p, h("h2", { class: "sb-h" }, "Edit"), h("p", { class: "muted" }, "Tap a design on the shirt to edit it.")); return; }
    const apply = (fn, save = true) => { fn(); drawStage(); if (save) commit(); };
    const common = h("div", { class: "sb-group" },
      h("h3", { class: "sb-h3" }, "Size and position"),
      numIn("Width (in)", l.w, 0.25, PW * 1.5, (v) => apply(() => { const r = l.h / l.w; l.w = v; if (l.aspectLock !== false) l.h = v * r; })),
      numIn("Height (in)", l.h, 0.25, PH * 1.5, (v) => apply(() => { const r = l.w / l.h; l.h = v; if (l.aspectLock !== false) l.w = v * r; })),
      h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: l.aspectLock !== false, onchange: (e) => apply(() => { l.aspectLock = e.target.checked; }) }), " Keep proportions"),
      range("Rotate", -180, 180, 1, l.rot, (v, done) => { l.rot = v; drawStage(); if (done) commit(); }).el,
      h("div", { class: "sb-btnrow" },
        btn("Center", () => apply(() => { l.x = PW / 2; })),
        btn("Top", () => apply(() => { l.y = l.h / 2 + 0.5; })),
        btn("Flip ↔", () => apply(() => { l.flipX = !l.flipX; })),
        btn("Flip ↕", () => apply(() => { l.flipY = !l.flipY; })),
        btn("Fit width", () => apply(() => { const r = l.h / l.w; l.w = PW * 0.95; l.h = l.w * r; if (l.h > PH) { l.h = PH * 0.95; l.w = l.h / r; } l.x = PW / 2; l.y = l.h / 2 + 0.25; }))),
      h("div", { class: "sb-btnrow" },
        btn("Bring forward", () => apply(() => move(l, 1))), btn("Send back", () => apply(() => move(l, -1))),
        btn("Duplicate", () => apply(() => { const c = structuredClone(l); c.id = `L${++uid}`; c.x += 0.5; c.y += 0.5; layers().push(c); S.sel = c.id; })),
        btn(l.locked ? "Unlock" : "Lock", () => apply(() => { l.locked = !l.locked; drawEdit(); })),
        btn("Delete", () => removeLayer(l), "danger")));
    put(p, h("h2", { class: "sb-h" }, `Edit: ${l.name}`), l.type === "text" ? textControls(l) : imageControls(l), common);
  }

  function textControls(l) {
    const t = l.text;
    const redraw = async (save) => { await loadFont(t.font); rendered.delete(l.id); const r = l.w; fitTextBox(l); l.w = r; fitTextBox(l); drawStage(); if (save) commit(); };
    const ta = h("textarea", { class: "field", rows: 2, "aria-label": "Text", maxlength: 200 }, t.value);
    ta.addEventListener("input", debounce(() => { t.value = ta.value; redraw(false); }, 200));
    ta.addEventListener("change", () => commit());
    return h("div", { class: "sb-group" },
      ta,
      h("label", { class: "sb-row" }, h("span", {}, "Font"), h("select", { class: "field", onchange: (e) => { t.font = e.target.value; redraw(true); } },
        fonts.map(([f]) => h("option", { value: f, selected: f === t.font, style: `font-family:"${f}"` }, f.replace(" Variable", ""))))),
      h("label", { class: "sb-row" }, h("span", {}, "Color"), h("input", { type: "color", value: t.color, oninput: (e) => { t.color = e.target.value; redraw(false); }, onchange: () => commit() })),
      h("label", { class: "sb-row" }, h("span", {}, "Outline"), h("input", { type: "color", value: t.outline, oninput: (e) => { t.outline = e.target.value; redraw(false); }, onchange: () => commit() })),
      range("Outline width", 0, 10, 1, t.outlineW, (v, done) => { t.outlineW = v; redraw(done); }).el,
      range("Letter spacing", -10, 60, 1, t.spacing, (v, done) => { t.spacing = v; redraw(done); }).el,
      range("Curve", -100, 100, 1, t.curve, (v, done) => { t.curve = v; redraw(done); }).el,
      h("div", { class: "sb-seg" }, ["left", "center", "right"].map((a) => h("button", { type: "button", class: "sb-pill", "aria-pressed": String(t.align === a), onclick: () => { t.align = a; redraw(true); drawEdit(); } }, a[0].toUpperCase() + a.slice(1)))),
    );
  }

  function imageControls(l) {
    const o = l.ops;
    const src = sources.get(l.src);
    const rerun = async (save = true) => {
      await busy("Working on your image…", async () => { rendered.delete(l.id); drawStage(); });
      say(""); if (save) commit(); drawSizeLine();
    };
    const toggle = (label, key, help, val = true) => h("label", { class: "sb-check" },
      h("input", { type: "checkbox", checked: !!o[key], onchange: (e) => { o[key] = e.target.checked ? val : 0; rerun(); drawEdit(); } }), ` ${label}`, help ? h("small", { class: "muted" }, ` ${help}`) : null);
    const slider = (label, key, min, max, step, def = 0) => range(label, min, max, step, o[key] ?? def, debounce((v, done) => { o[key] = v; rerun(done); }, 150)).el;
    const st = img.printStats(src.full.width, src.full.height, l.w, l.h);
    return h("div", {},
      h("div", { class: "sb-group" },
        h("h3", { class: "sb-h3" }, "Quick fixes"),
        h("div", { class: "sb-btnrow" },
          btn("✨ Auto enhance", () => { o.enhance = !o.enhance; rerun(); drawEdit(); }, o.enhance ? "on" : ""),
          btn("Remove background", () => { o.bg = !o.bg; rerun(); drawEdit(); }, o.bg ? "on" : ""),
          btn("Remove halftone", () => { o.descreen = o.descreen ? 0 : 3; rerun(); drawEdit(); }, o.descreen ? "on" : ""),
          btn("DTF ready", () => { o.dtf = !o.dtf; rerun(); drawEdit(); }, o.dtf ? "on" : "")),
        st.level !== "good" ? h("p", { class: "sb-note" }, `${Math.round(st.dpi)} DPI at this size. `, btn(`Upscale ${st.dpi < 150 ? "4×" : "2×"} at print`, () => { o.upscale = o.upscale ? 0 : (st.dpi < 150 ? 4 : 2); rerun(); drawEdit(); }, o.upscale ? "on" : "")) : null),
      o.bg ? h("div", { class: "sb-group" }, h("h3", { class: "sb-h3" }, "Background"),
        slider("Tolerance", "bgTol", 5, 120, 1, 30),
        h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: !!o.bgAll, onchange: (e) => { o.bgAll = e.target.checked; rerun(); } }), " Also remove that color inside the art"),
        h("label", { class: "sb-row" }, h("span", {}, "Color to remove"), h("input", { type: "color", value: o.bgColor ? rgbHex(o.bgColor) : "#ffffff", onchange: (e) => { o.bgColor = hexRgb(e.target.value); rerun(); } }),
          btn("Auto", () => { o.bgColor = null; rerun(); drawEdit(); }))) : null,
      o.descreen ? h("div", { class: "sb-group" }, h("h3", { class: "sb-h3" }, "Halftone removal"), slider("Strength", "descreen", 1, 5, 1, 3)) : null,
      o.dtf ? h("div", { class: "sb-group" }, h("h3", { class: "sb-h3" }, "DTF prep"),
        h("p", { class: "muted small" }, "Removes see-through pixels (they print faded), tightens edges, and checks for lines too thin to hold."),
        toggle("Let the shirt color show through", "knockout", `(removes ${S.color ?? "shirt"}-colored areas)`),
        thinWarning(l)) : null,
      h("div", { class: "sb-group" },
        h("h3", { class: "sb-h3" }, "Color"),
        slider("Brightness", "brightness", -100, 100, 1), slider("Contrast", "contrast", -100, 100, 1),
        slider("Saturation", "saturation", -100, 100, 1), slider("Hue", "hue", -180, 180, 1),
        h("div", { class: "sb-btnrow" }, toggle("Black and white", "grayscale"), toggle("Invert", "invert"), toggle("Reduce noise", "denoise")),
        h("label", { class: "sb-row" }, h("span", {}, "One color"), h("input", { type: "color", value: o.solid ?? "#ffffff", onchange: (e) => { o.solid = e.target.value; rerun(); drawEdit(); } }),
          o.solid ? btn("Off", () => { o.solid = null; rerun(); drawEdit(); }) : null),
        h("div", { class: "sb-row" }, h("span", {}, "Swap color"),
          h("input", { type: "color", "aria-label": "From color", value: o.replaceFrom ?? "#000000", onchange: (e) => { o.replaceFrom = e.target.value; o.replaceTo ??= "#ffffff"; rerun(); drawEdit(); } }), "→",
          h("input", { type: "color", "aria-label": "To color", value: o.replaceTo ?? "#ffffff", onchange: (e) => { o.replaceTo = e.target.value; o.replaceFrom ??= "#000000"; rerun(); drawEdit(); } }),
          o.replaceFrom ? btn("Off", () => { o.replaceFrom = o.replaceTo = null; rerun(); drawEdit(); }) : null),
        h("div", { class: "sb-btnrow" },
          btn("Trim empty edges", () => { trimLayer(l); }),
          btn("Reset all edits", () => { l.ops = {}; l.crop = null; rerun(); drawEdit(); }))),
    );
  }
  function thinWarning(l) {
    const c = rendered.get(l.id)?.canvas;
    if (!c) return null;
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    const pxPerIn = c.width / l.w;
    const r = img.thinLineReport(data, Math.max(2, Math.round(pxPerIn * 0.04))); // about 1 mm
    return r.ratio > 0.02 ? h("p", { class: "sb-note warn" }, `About ${Math.round(r.ratio * 100)}% of this art is thinner than 1 mm and may not hold up. Try printing it larger.`) : h("p", { class: "muted small" }, "Line weight looks good for DTF.");
  }
  function trimLayer(l) {
    const src = sources.get(l.src);
    const base = l.crop ? cropImage(src.preview, l.crop) : src.preview;
    const { image, x, y } = img.trimTransparent(process(src.preview, { ...l.ops, dtf: false }, l.crop, 1));
    if (!image.width || (image.width === base.width && image.height === base.height)) return say("Nothing to trim.");
    const prev = l.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const fx = prev.w / base.width, fy = prev.h / base.height;
    l.crop = { x: prev.x + x * fx, y: prev.y + y * fy, w: image.width * fx, h: image.height * fy };
    const kx = l.w / base.width, ky = l.h / base.height;
    // move the box centre to where the kept pixels already sit, respecting flips and rotation
    let dx = (x + image.width / 2 - base.width / 2) * kx * (l.flipX ? -1 : 1), dy = (y + image.height / 2 - base.height / 2) * ky * (l.flipY ? -1 : 1);
    const a = l.rot * Math.PI / 180;
    l.x += dx * Math.cos(a) - dy * Math.sin(a); l.y += dx * Math.sin(a) + dy * Math.cos(a);
    l.w = image.width * kx; l.h = image.height * ky;
    rendered.delete(l.id); commit(); drawAll(); say("Trimmed.");
  }

  // ---------- order ----------
  function drawOrder() {
    const v = variant(), b = blank();
    const qty = h("input", { class: "field", type: "number", min: 1, max: 99, value: S.qty, "aria-label": "Quantity", onchange: (e) => { S.qty = clamp(Math.round(Number(e.target.value) || 1), 1, 99); e.target.value = S.qty; drawOrder(); } });
    const fb = clipBox(boundsOf(S.layers.front)), bb = clipBox(boundsOf(S.layers.back));
    const addBtn = h("button", { type: "button", class: "btn brass full", disabled: !v || !v.available || (!fb && !bb), onclick: () => addToCart(addBtn) }, "Add to cart");
    put(panels.Order, 
      h("h2", { class: "sb-h" }, "Your shirt"),
      h("dl", { class: "sb-summary" },
        h("dt", {}, "Shirt"), h("dd", {}, b ? `${b.title}` : "None"),
        h("dt", {}, "Color"), h("dd", {}, S.color ?? "Pick one"),
        h("dt", {}, "Size"), h("dd", {}, S.size ?? "Pick one"),
        h("dt", {}, "Front print"), h("dd", {}, fb ? `${fmtIn(fb.w)} × ${fmtIn(fb.h)}` : "None"),
        h("dt", {}, "Back print"), h("dd", {}, bb ? `${fmtIn(bb.w)} × ${fmtIn(bb.h)}` : "None"),
        h("dt", {}, "Price"), h("dd", {}, v ? `${money.format(v.price / 100)} each` : "Pick a size")),
      h("label", { class: "sb-row" }, h("span", {}, "Quantity"), qty),
      outside(S.layers.front) || outside(S.layers.back) ? h("p", { class: "sb-note warn" }, "Part of your design is outside the print area, so that part won't print.") : null,
      lowDpiLayers().length ? h("p", { class: "sb-note warn" }, `Some art may print blurry: ${lowDpiLayers().map((l) => l.name).join(", ")}. You can still order, or make it smaller.`) : null,
      addBtn,
      h("p", { class: "muted small" }, "Need different sizes? Add this one to the cart, then pick another size and add again."),
    );
  }
  const lowDpiLayers = () => [...S.layers.front, ...S.layers.back].filter((l) => {
    if (l.type !== "image") return false;
    const s = sources.get(l.src), f = cropFrac(l);
    return img.printStats(s.full.width * f.w * (l.ops.upscale || 1), s.full.height * f.h * (l.ops.upscale || 1), l.w, l.h).level === "low";
  });

  async function addToCart(button) {
    const v = variant();
    if (!v) return say("Pick a shirt color and size first.", "err");
    button.disabled = true;
    try {
      await busy("Preparing your print files… this can take a few seconds.", async () => {
        const designId = `${idPrefix}-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
        const fd = new FormData();
        fd.append("id", String(v.id));
        fd.append("quantity", String(S.qty));
        fd.append("properties[Design ID]", designId);
        const used = [];
        for (const side of ["front", "back"]) {
          const ls = S.layers[side];
          if (!ls.length) continue;
          const out = await renderPrint(ls);
          const label = side === "front" ? "Front" : "Back";
          fd.append(`properties[${label} print size]`, `${fmtIn(out.bounds.w)} wide × ${fmtIn(out.bounds.h)} tall`);
          fd.append(`properties[_${label} placement]`, `${fmtIn(out.bounds.y)} down from top of print area, ${placementX(out.bounds, PW)}`);
          fd.append(`properties[_${label} print DPI]`, String(out.dpi));
          fd.append(`properties[_${label} print file]`, new File([out.blob], `${designId}-${side}.png`, { type: "image/png" }));
          used.push(...ls.map((l) => `${label}: ${l.type === "text" ? `text "${l.text.value.slice(0, 40)}" (${l.text.font})` : sources.get(l.src).from === "upload" ? "customer upload" : sources.get(l.src).code ? `${l.name} pattern ${sources.get(l.src).code}` : l.name}`));
        }
        const mock = await renderMockup();
        fd.append("properties[_Mockup]", new File([mock], `${designId}-mockup.png`, { type: "image/png" }));
        const uploads = [...new Set([...S.layers.front, ...S.layers.back].filter((l) => l.type === "image" && sources.get(l.src).file).map((l) => l.src))].slice(0, 2);
        uploads.forEach((id, i) => { const f = sources.get(id).file; if (f.size <= cfg.maxUploadMb * 1048576 && f.type !== "image/svg+xml") fd.append(`properties[_Original upload ${i + 1}]`, f, f.name); });
        fd.append("properties[_Art used]", used.join("; ").slice(0, 500));
        fd.append("properties[_Shirt color hex]", hexFor(S.color));
        if (qrSource) fd.append("properties[_QR source]", qrSource);
        if (crossSite) { dirty = false; say("Taking you to the cart…", "ok"); return handoff(`${store}/cart/add`, fd); }
        const res = await fetch(cfg.cartAddUrl, { method: "POST", body: fd, headers: { accept: "application/json" } });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.description || err.message || "That couldn't be added to the cart.");
        }
        dirty = false;
        say("Added to your cart.", "ok");
        location.href = cfg.cartUrl;
      });
    } catch (e) {
      say(e.message || "Something went wrong. Please try again.", "err");
      button.disabled = false;
    }
  }

  // full-resolution print file for one side: the whole print area at 300 DPI, trimmed to the art
  // full-resolution print file for one side, cropped to the art and clipped to the print area
  async function renderPrint(ls) {
    const bb = clipBox(boundsOf(ls));
    if (!bb) throw new Error("Your design is outside the print area. Move it onto the shirt.");
    const bmps = ls.map((l) => l.type === "text" ? textAt(l.text, l.h * DPI) : toCanvas(process(sources.get(l.src).full, l.ops, l.crop, "full")));
    let scale = Math.min(DPI, Math.floor(Math.sqrt(MAX_PX / (bb.w * bb.h))));
    for (;;) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(bb.w * scale)); c.height = Math.max(1, Math.ceil(bb.h * scale));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("This device ran out of memory making the print file. Try a smaller design or another device.");
      ctx.imageSmoothingQuality = "high";
      ctx.translate(-bb.x * scale, -bb.y * scale);
      ls.forEach((l, i) => {
        ctx.save();
        ctx.translate(l.x * scale, l.y * scale);
        ctx.rotate(l.rot * Math.PI / 180);
        ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
        ctx.drawImage(bmps[i], -l.w * scale / 2, -l.h * scale / 2, l.w * scale, l.h * scale);
        ctx.restore();
      });
      // DTF needs solid alpha: flatten anything resampling left half-transparent
      const data = img.removeSemiTransparent(ctx.getImageData(0, 0, c.width, c.height), 128);
      c.width = c.height = 0; // free it before the next allocation
      const { image, x, y } = img.trimTransparent(data);
      const out = document.createElement("canvas");
      out.width = image.width; out.height = image.height;
      out.getContext("2d").putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      const blob = await withDpi(await new Promise((r) => out.toBlob(r, "image/png")), scale);
      out.width = out.height = 0;
      if (blob.size <= (cfg.maxUploadMb - 0.5) * 1048576 || scale <= 150) {
        return { blob, dpi: scale, bounds: { x: bb.x + x / scale, y: bb.y + y / scale, w: image.width / scale, h: image.height / scale } };
      }
      scale -= 50; // over Shopify's file limit: step down resolution and try again
    }
  }
  // text drawn big enough to land at the target height in pixels, within the canvas cap
  function textAt(t, targetPx) {
    const probe = renderText(t, 160);
    const byHeight = 160 * targetPx / probe.height;
    const byArea = 160 * Math.sqrt(MAX_PX / (probe.width * probe.height));
    return renderText(t, Math.max(160, Math.min(byHeight, byArea, 2400)));
  }
  const clipBox = (b) => {
    if (!b) return null;
    const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(PW, b.x + b.w), y1 = Math.min(PH, b.y + b.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const outside = (ls) => { const b = boundsOf(ls); return !!b && (b.x < -0.05 || b.y < -0.05 || b.x + b.w > PW + 0.05 || b.y + b.h > PH + 0.05); };

  async function renderMockup() {
    const W = 1000, H = 1200;
    const c = document.createElement("canvas"); c.width = W * 2; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, H);
    for (const [i, side] of ["front", "back"].entries()) {
      const svgImg = await svgToImage(shirtSvg(hexFor(S.color), side), W, H);
      ctx.drawImage(svgImg, i * W, 0, W, H);
      const ax = i * W + W * AREA.x, ay = H * AREA.y, s = (W * AREA.w) / PW;
      ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, PW * s, PH * s); ctx.clip();
      for (const l of S.layers[side]) {
        const bmp = canvasFor(l);
        ctx.save();
        ctx.translate(ax + l.x * s, ay + l.y * s); ctx.rotate(l.rot * Math.PI / 180); ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
        ctx.drawImage(bmp, -l.w * s / 2, -l.h * s / 2, l.w * s, l.h * s); ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = "#555"; ctx.font = "28px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(side === "front" ? "Front" : "Back", i * W + W / 2, H - 24);
    }
    return new Promise((r) => c.toBlob(r, "image/png"));
  }

  // ---------- undo ----------
  function undo() { if (history.past.length < 2) return; history.future.push(history.past.pop()); restore(history.past.at(-1)); syncUndo(); }
  function redo() { const s = history.future.pop(); if (!s) return; history.past.push(s); restore(s); syncUndo(); }
  function syncUndo() { undoBtn.disabled = history.past.length < 2; redoBtn.disabled = !history.future.length; }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.matches("input, textarea, select")) return;
    if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
  });
  let dirty = false;
  const markDirty = () => { dirty = [...S.layers.front, ...S.layers.back].length > 0; };
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- misc helpers bound to state ----------
  function move(l, dir) {
    const arr = layers(), i = arr.indexOf(l), j = clamp(i + dir, 0, arr.length - 1);
    arr.splice(i, 1); arr.splice(j, 0, l);
  }
  function cropFrac(l) {
    if (!l.crop) return { w: 1, h: 1 };
    const s = sources.get(l.src).preview;
    return { w: l.crop.w / s.width, h: l.crop.h / s.height };
  }
  function cropImage(base, crop) {
    // crop is stored in preview pixels; scale it to whichever copy we are processing
    const prev = [...sources.values()].find((s) => s.preview === base || s.full === base);
    const k = prev ? base.width / prev.preview.width : 1;
    const x = Math.round(crop.x * k), y = Math.round(crop.y * k), w = Math.max(1, Math.round(crop.w * k)), hh = Math.max(1, Math.round(crop.h * k));
    const out = img.blank(w, hh);
    for (let r = 0; r < hh; r++) {
      const sr = y + r; if (sr < 0 || sr >= base.height) continue;
      const from = (sr * base.width + Math.max(0, x)) * 4;
      out.data.set(base.data.subarray(from, from + Math.min(w, base.width - x) * 4), r * w * 4);
    }
    return out;
  }
  function btn(label, onclick, cls = "") { return h("button", { type: "button", class: `btn ghost small ${cls}`, "aria-pressed": cls === "on" ? "true" : null, onclick }, label); }
  function numIn(label, value, min, max, on) {
    const i = h("input", { class: "field", type: "number", step: 0.1, min, max, value: value.toFixed(2), "aria-label": label });
    i.addEventListener("change", () => { const v = clamp(Number(i.value) || value, min, max); on(v); drawEdit(); });
    return h("label", { class: "sb-row" }, h("span", {}, label), i);
  }

  function drawAll() { drawSides(); drawShirtPanel(); drawShirt(); drawStage(); if (!panels.Edit.hidden) drawEdit(); if (!panels.Order.hidden) drawOrder(); markDirty(); }

  // ---------- go ----------
  put(panels.Text, h("h2", { class: "sb-h" }, "Text"), h("p", { class: "muted" }, "Add a line of text, then style it under Edit."),
    h("button", { type: "button", class: "btn", onclick: () => addTextLayer() }, "Add text"));
  drawUpload();
  drawAll();
  if (geo) { ex.palette = geo.defaultPalette(isDark(hexFor(S.color))); drawExplore(); }
  commit();
  loadFont(textFont);
  loadLibrary().then(drawLibrary);
  drawLibrary();
}

// Posts the cart line to the store as a normal multipart form, so the browser lands on the store's cart
// with the print files attached. Files go in real file inputs via DataTransfer.
function handoff(action, fd) {
  const form = document.createElement("form");
  form.method = "POST"; form.action = action; form.enctype = "multipart/form-data"; form.hidden = true;
  for (const [name, value] of fd.entries()) {
    const input = document.createElement("input");
    input.name = name;
    if (typeof value === "string") { input.type = "hidden"; input.value = value; }
    else { input.type = "file"; const dt = new DataTransfer(); dt.items.add(value); input.files = dt.files; }
    form.append(input);
  }
  const back = document.createElement("input");
  back.type = "hidden"; back.name = "return_to"; back.value = "/cart";
  form.append(back);
  document.body.append(form);
  form.submit();
}

// ---------- pure helpers ----------
// Writes the print resolution into the PNG (pHYs chunk) so RIP software sizes it right.
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
async function withDpi(blob, dpi) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4); dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
  let c = -1; for (let i = 4; i < 17; i++) c = CRC[(c ^ chunk[i]) & 255] ^ (c >>> 8);
  dv.setUint32(17, (c ^ -1) >>> 0);
  const at = 33; // after the 8-byte signature and the 25-byte IHDR chunk
  return new Blob([src.subarray(0, at), chunk, src.subarray(at)], { type: "image/png" });
}
const AREA = { x: 0.3, y: 0.24, w: 0.4 }; // print area as a fraction of the shirt drawing
function shirtSvg(fill, side) {
  const neck = side === "back" ? "Q250 62 335 40" : "Q250 98 335 40";
  // One outline for the whole shirt, so the shading runs across sleeves and body without a seam.
  const body = `M165 40 L120 55 L20 120 L60 215 L110 190 L110 570 Q250 585 390 570 L390 190 L440 215 L480 120 L380 55 L335 40 ${side === "back" ? "Q250 62 165 40" : "Q250 98 165 40"} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 600" width="500" height="600" aria-hidden="true">
    <defs>
      <linearGradient id="sbsh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".22" stop-color="#000" stop-opacity=".02"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset=".78" stop-color="#000" stop-opacity=".02"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
      <linearGradient id="sbsv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".07"/></linearGradient>
    </defs>
    <path d="${body}" fill="${fill}" stroke="rgba(0,0,0,.28)" stroke-width="2" stroke-linejoin="round"/>
    <path d="${body}" fill="url(#sbsh)"/>
    <path d="${body}" fill="url(#sbsv)"/>
    <path d="M120 55 Q134 126 110 190 M380 55 Q366 126 390 190 M29 116 L69 211 M471 116 L431 211 M110 556 Q250 571 390 556" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="1.5"/>
    <path d="M165 40 ${neck}" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="6" stroke-linecap="round"/>
  </svg>`;
}
function svgToImage(svg, w, hgt) {
  return new Promise((ok, fail) => {
    const i = new Image(w, hgt);
    i.onload = () => ok(i); i.onerror = fail;
    i.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
async function decode(blobIn, maxSide) {
  let bmp;
  if (blobIn.type === "image/svg+xml") {
    // rasterize vector art big enough for a full-size print; an <img> never runs scripts inside the SVG
    const url = URL.createObjectURL(blobIn);
    try {
      const i = await new Promise((ok, fail) => { const x = new Image(); x.onload = () => ok(x); x.onerror = () => fail(new Error("That SVG couldn't be read.")); x.src = url; });
      const r = (i.naturalHeight || 1000) / (i.naturalWidth || 1000);
      const w = r > 1 ? Math.round(maxSide / r) : maxSide;
      bmp = { draw: (ctx, W, H) => ctx.drawImage(i, 0, 0, W, H), width: w, height: Math.round(w * r) };
    } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  } else {
    const b = await createImageBitmap(blobIn).catch(() => { throw new Error("That image couldn't be read."); });
    bmp = { draw: (ctx, W, H) => ctx.drawImage(b, 0, 0, W, H), width: b.width, height: b.height };
  }
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height), Math.sqrt(MAX_PX / (bmp.width * bmp.height)));
  const W = Math.max(1, Math.round(bmp.width * k)), H = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  bmp.draw(ctx, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  return { width: W, height: H, data: d.data };
}
function downscale(im, maxSide) {
  const k = maxSide / Math.max(im.width, im.height);
  const src = toCanvas(im), c = document.createElement("canvas");
  c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}
function toCanvas(im) {
  const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
  if (im.width && im.height) c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(im.data), im.width, im.height), 0, 0);
  return c;
}
function trimCanvas(c) {
  const ctx = c.getContext("2d"), d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const pad = 4, o = document.createElement("canvas");
  o.width = x1 - x0 + 1 + pad * 2; o.height = y1 - y0 + 1 + pad * 2;
  o.getContext("2d").drawImage(c, x0 - pad, y0 - pad, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
async function sniffImage(file) {
  if (file.type === "image/svg+xml") { const t = (await file.slice(0, 2048).text()).toLowerCase(); return t.includes("<svg"); }
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return png || jpg || webp;
}
function boundsOf(ls) {
  if (!ls.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of ls) {
    const a = l.rot * Math.PI / 180, cw = Math.abs(l.w * Math.cos(a)) + Math.abs(l.h * Math.sin(a)), ch = Math.abs(l.w * Math.sin(a)) + Math.abs(l.h * Math.cos(a));
    x0 = Math.min(x0, l.x - cw / 2); x1 = Math.max(x1, l.x + cw / 2); y0 = Math.min(y0, l.y - ch / 2); y1 = Math.max(y1, l.y + ch / 2);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function placementX(b, pw) {
  const off = b.x + b.w / 2 - pw / 2;
  return Math.abs(off) < 0.1 ? "centered" : `${fmtIn(Math.abs(off))} ${off < 0 ? "left" : "right"} of center`;
}
const kindOf = (i) => i.kind || (i.type === "image/svg+xml" ? "svg" : "png");
const fmtIn = (v) => `${(Math.round(v * 10) / 10).toFixed(1)} in`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = (v, target) => Math.abs(v - target) < 0.15 ? target : v;
const snapAngle = (a) => { const n = ((a % 360) + 540) % 360 - 180; return [-180, -90, 0, 90, 180].find((s) => Math.abs(n - s) < 4) ?? n; };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const hexRgb = (hx) => { const n = parseInt(String(hx).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const isDark = (hx) => { const [r, g, b] = hexRgb(hx); return r * 0.299 + g * 0.587 + b * 0.114 < 120; };
function hashGray(s) { let n = 0; for (const ch of String(s ?? "")) n = (n * 31 + ch.charCodeAt(0)) >>> 0; const v = 90 + (n % 120); return rgbHex([v, v, v]); }
function parseHexList(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*(.+?)\s*=\s*(#[0-9a-f]{6})\s*$/i);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

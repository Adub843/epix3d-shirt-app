// Shirt builder, shared by the Elevated Designs and EPIX3D apps: blank picker, starter ideas, text with effects,
// clip art, badge shapes, a pattern maker, the art library, uploads with image effects, freehand drawing, layers
// and add-to-cart. Everything runs in the browser. Print files are rendered at 300 DPI and handed to the Elevated
// Designs Shopify cart as file properties, so the order carries them; the price always comes from the Shopify
// variant. Brand-specific settings live in index.html (data-sb-config).

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
// Used only when the page has no self-hosted font catalog (fontsUrl): Google Fonts [name, css2 family]
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
// One-tap text looks. "$ink", "$paper", "$a", "$b", "$c" are filled in from the shirt color.
const TEXT_STYLES = [
  ["Bold", { font: "Anton", upper: true }],
  ["Varsity", { font: "Graduate", color: "$a", outline: "$ink", outlineW: 3, outline2: "$b", outline2W: 2, warp: "arc", curve: 30, upper: true }],
  ["Script", { font: "Pacifico", color: "$a", shadow: "$b", shadowX: 5, shadowY: 5 }],
  ["Retro", { font: "Shrikhand", color: "$a", outline: "$b", outlineW: 3, warp: "wave", curve: 30 }],
  ["Chrome", { font: "Rampart One", color: "$a", grad: "$c", gradAngle: 180, outline: "$paper", outlineW: 2 }],
  ["Elegant", { font: "Playfair Display", spacing: 10 }],
  ["Stencil", { font: "Saira Stencil One", upper: true }],
  ["Circle badge", { font: "Russo One", warp: "circle", curve: 100, upper: true, value: "• your text here • your text here" }],
];

async function start(cfg) {
  // modules and photos carry app.js's ?v= stamp, so a deploy never mixes old and new files
  const here = (u) => { const x = new URL(u, import.meta.url); x.search = new URL(import.meta.url).search; return x.href; };
  const idPrefix = String(cfg.designIdPrefix || "ED").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4) || "ED";
  const [img, ds, geo, tplMod, storeMod, fontCat, { UI_ICONS }] = await Promise.all([
    import(cfg.imagingUrl ?? here("./imaging.js")),
    import(cfg.designUrl ?? here("./design.js")), // shapes, vector art and styled text
    cfg.geometryUrl ? import(cfg.geometryUrl) : null, // pattern maker
    cfg.templatesUrl === false ? null : import(cfg.templatesUrl ?? here("./templates.js")).catch(() => null), // Ideas tab
    import(cfg.saveUrl ?? here("./store.js")).catch(() => null), // saved designs in this browser
    cfg.fontsUrl ? fetch(cfg.fontsUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
    import(cfg.uiIconsUrl ?? here("./ui-icons.js")), // toolbar and tool rail icons
  ]);
  // shirt photos: blanks.json lists each style's front and back photo and where the print area sits on it
  const photoCfg = new URL(cfg.blanksUrl ?? here("./blanks/blanks.json"), location.href);
  const photos = await fetch(photoCfg).then((r) => (r.ok ? r.json() : null));
  if (!photos?.styles?.tee) throw new Error("shirt photos");
  const saves = storeMod?.openStore(idPrefix) ?? null;
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

  // ---------- fonts ----------
  // Self-hosted catalog (fonts.json, files next to it) when there is one, otherwise the Google Fonts list.
  const fontBase = cfg.fontsUrl ? new URL(cfg.fontsUrl, location.href) : null;
  const fontList = fontCat?.fonts?.length
    ? fontCat.fonts.map((f) => ({ name: f.name, group: f.group, url: new URL(f.file, fontBase).href }))
    : (Array.isArray(cfg.fonts) && cfg.fonts.length ? cfg.fonts : FONTS).map(([name, g]) => ({ name, group: "", google: g }));
  const fontByName = new Map(fontList.map((f) => [f.name, f]));
  const popular = (fontCat?.popular ?? []).filter((n) => fontByName.has(n));
  const fontGroups = [...(popular.length ? ["Popular"] : []), ...new Set(fontList.map((f) => f.group).filter(Boolean))];
  const textFont = fontByName.has(cfg.textFont) ? cfg.textFont : fontList[Math.min(2, fontList.length - 1)].name;
  const fontReady = new Set(), fontLoads = new Map();
  const loadFont = (name) => {
    if (fontLoads.has(name)) return fontLoads.get(name);
    const f = fontByName.get(name);
    let p;
    if (f?.url) p = new FontFace(name, `url("${f.url}") format("woff2")`, { display: "swap" }).load().then((ff) => { document.fonts.add(ff); });
    else {
      if (f?.google && !document.querySelector(`link[data-font="${f.google}"]`)) document.head.append(h("link", { rel: "stylesheet", "data-font": f.google, href: `https://fonts.googleapis.com/css2?family=${f.google}&display=swap` }));
      p = document.fonts.load(`80px "${name}"`);
    }
    p = p.then(() => { fontReady.add(name); }, () => { fontReady.add(name); }); // a font that fails falls back to the system font
    fontLoads.set(name, p);
    return p;
  };

  // ---------- state ----------
  const sources = new Map(); // id -> { full: ImageData, preview: ImageData, blob, file?: File, name, from, code? }
  const rendered = new Map(); // layer id -> { key, canvas }
  let uid = 0;
  const S = {
    blank: 0, type: "tee", color: null, size: null, qty: 1, side: "front", sel: null,
    layers: { front: [], back: [] },
  };
  S.blank = Math.max(0, blanks.findIndex((b) => (b.type ?? "tee") === "tee")); // start on the cheapest adult tee
  const history = { past: [], future: [] };
  const snapshot = () => JSON.stringify({ layers: S.layers, color: S.color, blank: S.blank });
  const commit = () => { history.past.push(snapshot()); if (history.past.length > 60) history.past.shift(); history.future.length = 0; syncUndo(); autosaveSoon(); };
  const restore = (snap) => { const o = JSON.parse(snap); S.layers = o.layers; S.color = o.color; S.blank = o.blank; S.sel = null; drawAll(); autosaveSoon(); };

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
  const svgEl = (vb, d, evenodd) => {
    const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
    s.setAttribute("viewBox", `0 0 ${vb[0]} ${vb[1]}`); s.setAttribute("aria-hidden", "true");
    p.setAttribute("d", d); if (evenodd) p.setAttribute("fill-rule", "evenodd");
    s.append(p);
    return s;
  };
  const uiIcon = (name) => { const e = svgEl([256, 256], UI_ICONS[name] ?? ""); e.classList.add("sb-ui"); return e; };
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
  const colorIn = (label, value, oninput, onchange = () => commit()) => h("label", { class: "sb-row" }, h("span", {}, label),
    h("input", { type: "color", value, "aria-label": label, oninput: (e) => oninput(e.target.value), onchange }));
  const pills = (label, list, current, on, cls = "") => h("div", { class: `sb-btnrow ${cls}`, role: "radiogroup", "aria-label": label }, list.map(([k, name]) =>
    h("button", { type: "button", role: "radio", class: "sb-pill", "aria-checked": String(k === current), onclick: () => on(k) }, name)));

  // ---------- layout ----------
  // Laid out like a product editor: tool rail and tool panel on the left, the shirt in the middle, the selected
  // layer's settings (or the order summary) on the right. On a phone the tools sit in a bar along the bottom and
  // the open panel scrolls under the shirt.
  const status = h("p", { class: "sb-status", role: "status", "aria-live": "polite" });
  const notice = h("div", { class: "sb-notice", hidden: true });
  // The shirt is a real photo: a color layer with the print on it, multiplied by the photo's shading,
  // plus the photo shot in black (folds, highlights, the studio backdrop).
  const tint = h("div", { class: "sb-tint" });
  const printBox = h("div", { class: "sb-print" });
  const shadeImg = h("img", { class: "sb-shade", alt: "", decoding: "async", draggable: "false" });
  const baseImg = h("img", { class: "sb-base", alt: "", decoding: "async", draggable: "false" });
  const photo = h("div", { class: "sb-photo", "aria-hidden": "true" }, tint, printBox, shadeImg, baseImg);
  const area = h("div", { class: "sb-area", tabindex: "0", "aria-label": "Print area. Arrow keys move the selected art." });
  const stage = h("div", { class: "sb-stage" }, photo, area);
  const sideBtns = h("div", { class: "sb-seg", role: "tablist", "aria-label": "Shirt side" });
  const tbtn = (icon, label, onclick) => h("button", { type: "button", class: "sb-tbtn", title: label, "aria-label": label, onclick }, uiIcon(icon));
  const undoBtn = tbtn("arrow-counter-clockwise", "Undo", () => undo());
  const redoBtn = tbtn("arrow-clockwise", "Redo", () => redo());
  undoBtn.disabled = redoBtn.disabled = true;
  const saveBtn = saves ? h("button", { type: "button", class: "sb-tbtn wide", onclick: () => saveDesign() }, uiIcon("floppy-disk"), h("span", {}, "Save")) : null;
  const guideChk = h("input", { type: "checkbox", checked: true, onchange: () => stage.classList.toggle("no-guide", !guideChk.checked) });
  const sizeLine = h("p", { class: "sb-size small" });
  const orderPrice = h("span", { class: "sb-oprice" });
  const orderBtn = h("button", { type: "button", class: "btn sb-orderbtn", onclick: () => showTab("Order") }, orderPrice, h("span", {}, "Order"));

  const TOOLS = ["Shirt", "Library", "Text", "Upload", "Art", ...(tplMod ? ["Ideas"] : []), "Draw", "Layers"];
  const TOOL_INFO = { Shirt: ["t-shirt", "Product"], Library: ["images", "Designs"], Ideas: ["lightbulb", "Ideas"], Text: ["text-t", "Text"], Art: ["shapes", "Art"],
    Upload: ["upload-simple", "Upload"], Draw: ["pencil-simple", "Draw"], Layers: ["stack", "Layers"] };
  const panels = Object.fromEntries([...TOOLS, "Edit", "Order"].map((t) => [t, h("section", { class: "sb-panel", id: `sb-p-${t}`, role: "tabpanel", hidden: t !== "Shirt" })]));
  const rail = h("nav", { class: "sb-rail", role: "tablist", "aria-label": "Tools" }, TOOLS.map((t) =>
    h("button", { type: "button", role: "tab", "data-tool": t, "aria-selected": String(t === "Shirt"), "aria-controls": `sb-p-${t}`, onclick: () => showTab(t) },
      uiIcon(TOOL_INFO[t][0]), h("span", {}, TOOL_INFO[t][1]))));
  const phone = window.matchMedia("(max-width: 900px)");
  const view = { tool: "Shirt", order: false, sel: undefined };
  // which panels show: the tool panel on the left; Edit (something selected) or Order on the right. A phone shows one.
  function layout() {
    const sel = selLayer(), mobile = phone.matches;
    if (mobile && sel) view.order = false;
    const was = { edit: panels.Edit.hidden, order: panels.Order.hidden };
    for (const t of TOOLS) panels[t].hidden = t !== view.tool || (mobile && (!!sel || view.order));
    panels.Edit.hidden = !sel;
    panels.Order.hidden = mobile ? !view.order : !!sel;
    for (const b of rail.children) b.setAttribute("aria-selected", String(b.dataset.tool === view.tool && !(mobile && (sel || view.order))));
    orderBtn.setAttribute("aria-pressed", String(!panels.Order.hidden));
    root.classList.toggle("has-sel", !!sel);
    if (!panels.Edit.hidden && (was.edit || view.sel !== S.sel)) drawEdit();
    if (!panels.Order.hidden && was.order) drawOrder();
    view.sel = S.sel;
    area.classList.toggle("is-drawing", drawing());
  }
  phone.addEventListener("change", () => layout());
  const showTab = (t) => {
    if (TOOLS.includes(t)) {
      view.tool = t; view.order = false;
      if (phone.matches && S.sel) { S.sel = null; drawStage(); }
    } else if (t === "Order") {
      view.order = true;
      if (S.sel) { S.sel = null; drawStage(); }
    } else view.order = false; // "Edit": shows when something is selected
    layout();
    if (t === "Draw") { pen.on = true; if (phone.matches) stage.scrollIntoView({ behavior: "smooth", block: "start" }); }
    area.classList.toggle("is-drawing", drawing());
    if (t === "Order") { drawOrder(); if (phone.matches) panels.Order.scrollIntoView({ behavior: "smooth", block: "start" }); }
    if (t === "Edit") drawEdit();
    if (t === "Art") drawArt();
    if (t === "Library") drawLibraryTab();
    if (t === "Layers") drawLayers();
    if (t === "Ideas") drawIdeas();
    if (t === "Draw") drawDraw();
  };

  put(root, h("div", { class: "sb-app" },
    h("h1", { class: "sb-sr" }, cfg.heading || "Build your shirt"),
    h("div", { class: "sb-bar" },
      h("div", { class: "sb-bar-l" }, undoBtn, redoBtn),
      h("div", { class: "sb-bar-c" }, sideBtns),
      h("div", { class: "sb-bar-r" }, saveBtn, orderBtn)),
    h("div", { class: "sb-editor" },
      rail,
      h("div", { class: "sb-drawer" }, TOOLS.map((t) => panels[t])),
      h("div", { class: "sb-canvas" },
        notice,
        stage,
        h("div", { class: "sb-under" }, sizeLine, h("label", { class: "sb-check small" }, guideChk, " Show print area")),
        status),
      h("aside", { class: "sb-props", "aria-label": "Selected design and order" }, panels.Edit, panels.Order))));

  // ---------- shirt ----------
  const blank = () => blanks[S.blank];
  const colorsOf = (b) => b ? [...new Set(b.variants.map((v) => v.options[b.colorIndex - 1]).filter(Boolean))] : [];
  const sizesOf = (b, color) => b ? b.variants.filter((v) => !b.colorIndex || v.options[b.colorIndex - 1] === color)
    .map((v) => ({ size: v.options.filter((_, i) => i !== b.colorIndex - 1).join(" / ") || "One size", v })) : [];
  const variant = () => { const b = blank(); return sizesOf(b, S.color).find((x) => x.size === S.size)?.v ?? null; };
  const hexFor = (name) => blank()?.colorHex?.[name] ?? colorHex[String(name ?? "").toLowerCase().trim()] ?? hashGray(name);
  const shirtDark = () => isDark(hexFor(S.color));
  const ink = () => (shirtDark() ? "#ffffff" : "#111111"); // default color for new text and art
  const kit = (accent = "varsity") => tplMod?.colorsFor(shirtDark(), accent) ?? { ink: ink(), paper: shirtDark() ? "#111111" : "#ffffff", a: ink(), b: ink(), c: ink(), dark: shirtDark() };

  // ---------- shirt photo ----------
  const styleOf = (b = blank()) => (photos.styles[photos.byType?.[b?.type ?? "tee"]] ? photos.byType[b?.type ?? "tee"] : "tee");
  const viewOf = (side = S.side, b) => photos.styles[styleOf(b)][side] ?? photos.styles.tee[side];
  const photoUrl = (side, kind, b) => { const u = new URL(`${styleOf(b)}-${side}${kind === "shade" ? "-shade" : ""}.jpg`, photoCfg); u.search = photoCfg.search; return u.href; };
  const photoImgs = new Map();
  const photoImg = (url) => {
    if (!photoImgs.has(url)) photoImgs.set(url, new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => { photoImgs.delete(url); fail(new Error("photo")); }; i.src = url; }));
    return photoImgs.get(url);
  };
  // the print area on the photo, as fractions of the photo's width: left, top, width (the height follows PW:PH)
  const areaBox = (side = S.side, b) => { const v = viewOf(side, b); return { x: v.cx - (v.ppi * PW) / 2, y: v.top, w: v.ppi * PW }; };
  function drawShirt() {
    const fill = hexFor(S.color);
    tint.style.background = fill;
    const base = photoUrl(S.side, "base"), shade = photoUrl(S.side, "shade");
    // swap both photos together once they're loaded, so the shading never lands on the wrong shirt
    Promise.all([photoImg(base), photoImg(shade)]).then(() => {
      if (photoUrl(S.side, "base") !== base) return;
      baseImg.src = base; shadeImg.src = shade; stage.classList.add("is-ready");
    }).catch(() => say("The shirt photo didn't load. Check your connection and refresh.", "err"));
    const a = areaBox();
    for (const el of [printBox, area]) { el.style.left = `${a.x * 100}%`; el.style.top = `${a.y * 100}%`; el.style.width = `${a.w * 100}%`; }
    stage.style.setProperty("--sb-ink", isDark(fill) ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.4)");
    root.style.setProperty("--sb-shirt", fill);
    root.style.setProperty("--sb-on-shirt", isDark(fill) ? "#ffffff" : "#111111");
    const other = S.side === "front" ? "back" : "front";
    photoImg(photoUrl(other, "base")).catch(() => {}); photoImg(photoUrl(other, "shade")).catch(() => {});
    orderPrice.textContent = variant() ? money.format(variant().price / 100) : "";
  }
  // the shirt photo in the chosen color with paint() drawn on it, px square; paint gets the print area's corner and px per inch
  async function shirtPhoto(side, px, paint) {
    const [base, shade] = await Promise.all([photoImg(photoUrl(side, "base")), photoImg(photoUrl(side, "shade"))]);
    const c = document.createElement("canvas"); c.width = c.height = px;
    const ctx = c.getContext("2d");
    ctx.fillStyle = hexFor(S.color); ctx.fillRect(0, 0, px, px);
    const a = areaBox(side);
    await paint(ctx, a.x * px, a.y * px, (a.w * px) / PW);
    ctx.globalCompositeOperation = "multiply"; ctx.drawImage(shade, 0, 0, px, px);
    ctx.globalCompositeOperation = "lighter"; ctx.drawImage(base, 0, 0, px, px);
    ctx.globalCompositeOperation = "source-over";
    return c;
  }

  function drawShirtPanel() {
    const p = panels.Shirt;
    if (!blanks.length) { put(p, h("h2", { class: "sb-h" }, "Shirts are being restocked"), h("p", { class: "muted" }, "Check back soon, or shop our ready-made tees in the meantime."), h("a", { class: "btn full", href: store || "https://elevatedshirts.com" }, "Shop ready-made tees")); return; }
    S.type = blank().type ?? "other"; // follows the shirt, so undo and type tabs always agree
    const inType = blanks.map((bl, i) => ({ bl, i })).filter(({ bl }) => (bl.type ?? "other") === S.type);
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
      h("div", { class: "sb-blanks", role: "radiogroup", "aria-label": "Shirt style" }, inType.map(({ bl, i }) =>
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
      onclick: () => { S.side = s; S.sel = null; drawAll(); if (!panels.Layers.hidden) drawLayers(); } }, s === "front" ? "Front" : "Back", S.layers[s].length ? h("small", {}, ` ${S.layers[s].length}`) : null)));
  }

  // ---------- layers on the stage ----------
  const layers = () => S.layers[S.side];
  const shown = (ls) => ls.filter((l) => !l.hidden); // hidden layers don't show, print or count
  const selLayer = () => layers().find((l) => l.id === S.sel) ?? null;
  const ppi = () => area.clientWidth / PW;

  function drawStage() {
    const scale = ppi();
    area.style.aspectRatio = printBox.style.aspectRatio = `${PW} / ${PH}`;
    const at = (l) => `left:${(l.x - l.w / 2) * scale}px;top:${(l.y - l.h / 2) * scale}px;width:${l.w * scale}px;height:${l.h * scale}px;` +
      `transform:rotate(${l.rot}deg) scale(${l.flipX ? -1 : 1},${l.flipY ? -1 : 1})`;
    const inkEls = [], hits = [];
    for (const l of shown(layers())) {
      // the art itself sits under the photo's shading; a clear box on top takes the clicks and shows the handles
      const c = canvasFor(l), v = h("div", { class: "sb-pl" });
      v.style.cssText = at(l);
      if (c) { c.classList.add("sb-bmp"); v.append(c); }
      inkEls.push(v);
      const node = h("div", { class: `sb-layer${l.id === S.sel ? " sel" : ""}${l.locked ? " locked" : ""}`, "data-id": l.id, title: l.name });
      node.style.cssText = at(l);
      if (l.id === S.sel && !l.locked) node.append(h("span", { class: "sb-h-scale", "data-handle": "scale", "aria-hidden": "true" }), h("span", { class: "sb-h-rot", "data-handle": "rot", "aria-hidden": "true" }));
      hits.push(node);
    }
    put(printBox, ...inkEls);
    put(area, ...hits);
    drawSizeLine();
    layout();
  }

  function drawSizeLine() {
    const l = selLayer();
    if (!l || l.hidden) { const bb = boundsOf(shown(layers())); sizeLine.textContent = bb ? `Design on the ${S.side}: ${fmtIn(bb.w)} wide × ${fmtIn(bb.h)} tall` : "Add text, one of your designs or your own image to start."; return; }
    const off = outside([l]) ? " · part is outside the print area and won't print" : "";
    const src = l.type === "image" ? sources.get(l.src) : null;
    const st = src ? img.printStats(src.full.width * cropFrac(l).w, src.full.height * cropFrac(l).h, l.w, l.h) : null;
    put(sizeLine, `${l.name}: ${fmtIn(l.w)} × ${fmtIn(l.h)}`,
      l.type === "text" && !l.locked ? h("span", { class: "sb-hint" }, " · double-tap the text to type") : null,
      st ? h("span", { class: `sb-dpi ${st.level}` }, ` · ${Math.round(st.dpi)} DPI ${st.level === "good" ? "✓ sharp" : st.level === "ok" ? "· may look soft" : "· too small, will print blurry"}`) : null, off ? h("span", { class: "sb-dpi low" }, off) : null);
  }

  // pointer: drag to move, handles to scale and rotate; on the Draw tab, drag draws a line
  let drag = null, stroke = null;
  const lastTap = { id: null, t: 0 };
  const toIn = (e) => { const r = area.getBoundingClientRect(), s = ppi(); return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; };
  area.addEventListener("pointerdown", (e) => {
    if (drawing()) { e.preventDefault(); area.setPointerCapture(e.pointerId); startStroke(toIn(e)); return; }
    const node = e.target.closest(".sb-layer");
    if (!node) { if (S.sel) { S.sel = null; drawStage(); if (!panels.Layers.hidden) drawLayers(); } return; }
    const l = layers().find((x) => x.id === node.dataset.id);
    if (!l) return;
    if (S.sel !== l.id) { S.sel = l.id; drawStage(); if (!panels.Edit.hidden) drawEdit(); if (!panels.Layers.hidden) drawLayers(); }
    // double-click or double-tap text on the shirt to type in it
    const now = performance.now();
    if (l.type === "text" && lastTap.id === l.id && now - lastTap.t < 400) { lastTap.id = null; showTab("Edit"); focusTextBox(false); return; }
    lastTap.id = l.id; lastTap.t = now;
    if (l.locked) return;
    e.preventDefault();
    area.setPointerCapture(e.pointerId);
    const r = area.getBoundingClientRect(), s = ppi();
    drag = { l, mode: e.target.dataset.handle ?? "move", sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, w: l.w, h: l.h, rot: l.rot,
      cx: r.left + l.x * s, cy: r.top + l.y * s, s, moved: false };
  });
  area.addEventListener("pointermove", (e) => {
    if (stroke) { moveStroke(toIn(e), e.shiftKey); return; }
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
  const endDrag = () => { if (stroke) { endStroke(); return; } if (drag?.moved) commit(); drag = null; };
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
  const baseLayer = (type, name) => ({ id: `L${++uid}`, type, name, x: PW / 2, y: PH / 2, w: PW * 0.5, h: PW * 0.5, rot: 0, flipX: false, flipY: false, opacity: 100, locked: false, hidden: false, aspectLock: true });
  function addLayer(l, msg) {
    layers().push(l); S.sel = l.id; commit(); drawAll();
    if (msg) say(msg);
    if (window.matchMedia("(max-width: 900px)").matches) stage.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function imageLayer(srcId, name) {
    const src = sources.get(srcId);
    const ar = src.full.height / src.full.width;
    let w = Math.min(PW * 0.8, (src.full.width / DPI) * 1.0 || PW * 0.6);
    w = clamp(w, Math.min(4, PW * 0.6), PW * 0.8);
    let hgt = w * ar;
    if (hgt > PH * 0.8) { hgt = PH * 0.8; w = hgt / ar; }
    return { ...baseLayer("image", name), src: srcId, y: Math.min(PH / 2, hgt / 2 + 1), w, h: hgt, ops: {}, crop: null };
  }
  const addImageLayer = (srcId, name) => addLayer(imageLayer(srcId, name), `Added ${name}. Drag to move, use the corner to resize.`);
  const textDefaults = () => ({ value: "Your text", font: textFont, color: ink(), outline: "#000000", outlineW: 0, outline2: "#ffffff", outline2W: 0,
    spacing: 0, curve: 0, warp: "arc", align: "center", grad: null, gradAngle: 180, shadow: null, shadowX: 6, shadowY: 6, upper: false, lineH: 1.15 });
  function textLayer(text, w = PW * 0.7) {
    const t = { ...textDefaults(), ...text };
    const l = { ...baseLayer("text", nameOf(t.value)), text: t, y: 3, w };
    fitTextBox(l);
    return l;
  }
  async function addText(text = {}) {
    const l = textLayer(text);
    await loadFont(l.text.font);
    fitTextBox(l); l.y = Math.min(PH / 2, l.h / 2 + 1);
    addLayer(l); showTab("Edit"); focusTextBox(true);
  }
  // put the cursor in the text box so people can type right away (also used by double-tap on the shirt)
  function focusTextBox(selectAll) {
    requestAnimationFrame(() => {
      const ta = panels.Edit.querySelector("textarea.sb-textinput");
      if (!ta) return;
      ta.scrollIntoView({ block: "center", behavior: "smooth" });
      ta.focus({ preventScroll: true });
      if (selectAll) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }
  const vecDefaults = () => ({ fill: ink(), grad: null, gradAngle: 90, outline: shirtDark() ? "#111111" : "#ffffff", outlineW: 0, shadow: null, shadowX: 4, shadowY: 4, line: 0 });
  function vecLayer(vec, name, art, w = PW * 0.45) {
    const l = { ...baseLayer("vec", name), art, vec: { ...vecDefaults(), ...vec }, w };
    fitVecBox(l); l.y = Math.min(PH / 2, l.h / 2 + 1);
    return l;
  }
  function removeLayer(l) {
    S.layers[S.side] = layers().filter((x) => x !== l); rendered.delete(l.id); S.sel = null; commit(); drawAll();
    if (!panels.Layers.hidden) drawLayers();
  }
  function duplicate(l) {
    const c = structuredClone(l); c.id = `L${++uid}`; c.x += 0.5; c.y += 0.5; c.locked = false;
    layers().push(c); S.sel = c.id; commit(); drawAll(); say(`Copied ${l.name}.`);
  }
  const nameOf = (v) => String(v || "Text").replace(/\s+/g, " ").trim().slice(0, 24) || "Text";

  // ---------- rendering a layer's bitmap ----------
  function canvasFor(l) {
    const key = l.type === "text" ? `${JSON.stringify(l.text)}|${fontReady.has(l.text.font)}` : l.type === "vec" ? JSON.stringify(l.vec)
      : `${l.src}|${JSON.stringify(l.ops)}|${JSON.stringify(l.crop)}|${l.ops.knockout ? S.color : ""}`;
    const hit = rendered.get(l.id);
    if (hit?.key === key) return hit.canvas;
    if (l.type === "text" && !fontReady.has(l.text.font)) loadFont(l.text.font).then(() => drawStage());
    const canvas = l.type === "text" ? ds.renderText(l.text, 160) : l.type === "vec" ? ds.renderVec(l.vec, 600)
      : toCanvas(process(sources.get(l.src).preview, l.ops, l.crop, 1));
    rendered.set(l.id, { key, canvas });
    return canvas;
  }
  // Re-render after an edit, keeping the art the same size on the shirt when the bitmap grows (outline, shadow).
  function rerender(l) {
    const old = rendered.get(l.id)?.canvas;
    rendered.delete(l.id);
    const c = canvasFor(l);
    if (old && old.width && old.height && (old.width !== c.width || old.height !== c.height)) {
      l.w *= c.width / old.width; l.h *= c.height / old.height;
    }
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
    // style effects: sizes are percents of the image, so preview and print match
    if (ops.mask) im = img.maskShape(im, ops.mask);
    if (ops.pixel) im = img.pixelate(im, ops.pixel);
    if (ops.poster) im = img.quantize(im, ops.poster).image;
    if (ops.duo) im = img.duotone(im, hexRgb(ops.duoA ?? "#1b1b1d"), hexRgb(ops.duoB ?? "#ff2e88"));
    if (ops.stencil) im = img.stencil(im, ops.stencil, hexRgb(ops.stencilInk ?? ink()));
    if (ops.half) im = img.halftone(im, { cellPct: ops.half, angle: ops.halfAngle ?? 45, by: ops.halfBy ?? "dark", ink: ops.halfInk ? hexRgb(ops.halfInk) : null });
    if (ops.stroke) im = img.outline(im, { widthPct: ops.stroke, color: hexRgb(ops.strokeColor ?? "#ffffff") });
    if (ops.shadow) im = img.dropShadow(im, { dxPct: ops.shadowX ?? 3, dyPct: ops.shadowY ?? 3, color: hexRgb(ops.shadowColor ?? "#000000") });
    if (ops.distress) im = img.distress(im, { amount: ops.distress, seed: ops.distressSeed ?? 7 });
    if (ops.dtf) im = img.dtfPrep(im, { threshold: 128, choke: Math.max(1, Math.round(k)), knockout: ops.knockout ? hexRgb(hexFor(S.color)) : null }).image;
    return im;
  }

  // ---------- text and vector sizing ----------
  function fitTextBox(l) {
    const c = ds.renderText(l.text, 160);
    l.h = l.w * (c.height / c.width);
    if (l.h > PH * 0.9) { l.h = PH * 0.9; l.w = l.h * (c.width / c.height); }
  }
  function fitVecBox(l) {
    const c = ds.renderVec(l.vec, 200);
    l.h = l.w * (c.height / c.width);
    if (l.h > PH * 0.9) { l.h = PH * 0.9; l.w = l.h * (c.width / c.height); }
  }

  // ---------- library (the console's public art) ----------
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
    } catch { lib.error = "Your designs couldn't load. Check your connection and refresh, or upload your own art."; }
    lib.loaded = true;
  }
  const libUrl = (i) => `${libBase}/api/images/${encodeURIComponent(i.key)}`;
  function drawLibrary(p) {
    if (!lib.loaded) { put(p, h("p", { class: "muted" }, "Loading art…")); return; }
    if (!lib.items.length && !lib.error) { put(p, h("p", { class: "muted" }, "New designs are on the way. In the meantime, add text or shapes", geo ? ", make a pattern" : "", " or upload your own art.")); return; }
    const q = lib.q.toLowerCase().trim();
    const cats = [...new Set(lib.items.map((i) => i.category).filter(Boolean))].sort();
    const list = lib.items.filter((i) => (!lib.cat || (lib.cat === FOCUS ? isFocus(i) : i.category === lib.cat)) && (!lib.kind || kindOf(i) === lib.kind) &&
      (!q || q.split(/\s+/).every((w) => `${i.name ?? ""} ${i.tags ?? ""} ${i.category ?? ""}`.toLowerCase().includes(w))));
    const search = h("input", { class: "field", type: "search", placeholder: cfg.librarySearchHint || "Search art, e.g. anchor, pineapple, Christmas", value: lib.q, "aria-label": "Search art" });
    search.addEventListener("input", debounce(() => { lib.q = search.value; lib.shown = 60; drawLibrary(p); p.querySelector("input[type=search]")?.focus(); }, 250));
    const sel = (label, val, opts, on) => h("select", { class: "field", "aria-label": label, onchange: (e) => on(e.target.value) },
      h("option", { value: "" }, label), opts.map(([v, t]) => h("option", { value: v, selected: v === val }, t)));
    put(p,
      lib.error ? h("p", { class: "sb-note" }, lib.error) : null,
      lib.items.length ? h("div", { class: "sb-filters" }, search,
        sel("All categories", lib.cat, [...(lib.items.some(isFocus) ? [[FOCUS, cfg.libraryFocusLabel || "Featured"]] : []), ...cats.map((c) => [c, c])], (v) => { lib.cat = v; lib.shown = 60; drawLibrary(p); }),
        sel("All types", lib.kind, [["svg", "SVG"], ["png", "PNG"], ["dtf", "DTF-ready"]], (v) => { lib.kind = v; lib.shown = 60; drawLibrary(p); })) : null,
      lib.items.length ? h("p", { class: "muted small" }, `${list.length} designs`) : null,
      h("div", { class: "sb-lib", role: "list" }, list.slice(0, lib.shown).map((i) =>
        h("button", { type: "button", role: "listitem", class: "sb-tile", title: `${i.name ?? "Design"}${i.tags ? ` · ${i.tags}` : ""}`,
          onclick: () => addFromLibrary(i) },
          h("img", { src: libUrl(i), alt: i.name ?? "Design", loading: "lazy", decoding: "async", crossorigin: "anonymous" }),
          kindOf(i) === "dtf" ? h("span", { class: "sb-badge" }, "DTF") : null))),
      list.length > lib.shown ? h("button", { type: "button", class: "btn ghost full", onclick: () => { lib.shown += 60; drawLibrary(p); } }, "Show more") : null,
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

  // ---------- art tab: clip art, shapes, patterns, library ----------
  const art = { seg: "shapes", q: "", group: -1, shown: 90, color: null, icons: null, loading: null };
  const artBody = h("div", { class: "sb-artbody" });
  const loadArt = () => (art.loading ??= cfg.artUrl
    ? fetch(cfg.artUrl).then((r) => (r.ok ? r.json() : null)).then((j) => { art.icons = j; }).catch(() => { art.icons = null; })
    : Promise.resolve());
  const artColor = () => art.color ?? ink();
  const segs = () => [["shapes", "Shapes"], ...(geo ? [["patterns", "Patterns"]] : []), ...(cfg.artUrl ? [["clip", "Icons"]] : [])];
  function drawArt() {
    if (!segs().some(([k]) => k === art.seg)) art.seg = segs()[0][0];
    const colorRow = art.seg === "clip" || art.seg === "shapes"
      ? h("label", { class: "sb-row" }, h("span", {}, "Art color"), h("input", { type: "color", value: artColor(), "aria-label": "Art color", onchange: (e) => { art.color = e.target.value; drawArt(); } }),
        art.color ? h("button", { type: "button", class: "btn ghost small", onclick: () => { art.color = null; drawArt(); } }, "Match shirt") : null)
      : null;
    put(panels.Art, h("h2", { class: "sb-h" }, "Art"), pills("Kind of art", segs(), art.seg, (k) => { art.seg = k; drawArt(); }, "sb-segs"), colorRow, artBody);
    if (art.seg === "clip") drawClipArt();
    else if (art.seg === "shapes") drawShapes();
    else drawExplore();
  }
  // the art library (the console's designs) has its own tool
  const libBody = h("div", { class: "sb-artbody" });
  function drawLibraryTab() {
    put(panels.Library, h("h2", { class: "sb-h" }, cfg.libraryLabel || "Your designs"), libBody);
    drawLibrary(libBody);
  }
  function drawClipArt() {
    if (!art.icons) {
      put(artBody, h("p", { class: "muted" }, art.loading ? "Loading clip art…" : "Clip art isn't available right now."));
      loadArt().then(() => { if (art.seg === "clip" && !panels.Art.hidden && art.icons) drawClipArt(); });
      return;
    }
    const A = art.icons, q = art.q.toLowerCase().trim();
    const list = A.icons.filter((i) => (art.group < 0 || i.g === art.group) && (!q || q.split(/\s+/).every((w) => `${i.n} ${i.t}`.includes(w))));
    const search = h("input", { class: "field", type: "search", placeholder: "Search clip art, e.g. skull, palm, lightning", value: art.q, "aria-label": "Search clip art" });
    search.addEventListener("input", debounce(() => { art.q = search.value; art.shown = 90; drawClipArt(); artBody.querySelector("input[type=search]")?.focus(); }, 200));
    put(artBody,
      search,
      h("div", { class: "sb-chips", role: "radiogroup", "aria-label": "Clip art group" }, [[-1, "All"], ...A.groups.map((g, i) => [i, g])].map(([i, g]) =>
        h("button", { type: "button", role: "radio", class: "sb-pill sm", "aria-checked": String(i === art.group), onclick: () => { art.group = i; art.shown = 90; drawClipArt(); } }, g))),
      h("p", { class: "muted small" }, `${list.length} pieces. Tap one to add it, then change its color and outline under Edit.`),
      h("div", { class: "sb-lib sb-icons", role: "list", style: `color:${artColor()}` }, list.slice(0, art.shown).map((i) =>
        h("button", { type: "button", role: "listitem", class: "sb-tile on-shirt", title: i.n, "aria-label": `Add ${i.n}`, onclick: () => addIcon(i) }, svgEl([A.vb, A.vb], i.d)))),
      list.length > art.shown ? h("button", { type: "button", class: "btn ghost full", onclick: () => { art.shown += 90; drawClipArt(); } }, "Show more") : null,
      h("p", { class: "muted small" }, `Clip art: ${A.source}.`),
    );
  }
  const addIcon = (i) => addLayer(vecLayer({ d: i.d, vb: [art.icons.vb, art.icons.vb], fill: artColor() }, cap(i.n), `clip art ${i.n}`), `Added ${i.n}. Change its color and outline under Edit.`);
  function drawShapes() {
    put(artBody,
      h("p", { class: "muted small" }, "Badges, banners and frames to put text on. Tap to add, then send it back under Layers."),
      h("div", { class: "sb-lib sb-icons", role: "list", style: `color:${artColor()}` }, ds.SHAPES.map((s) =>
        h("button", { type: "button", role: "listitem", class: "sb-tile on-shirt", title: s.name, "aria-label": `Add ${s.name}`,
          onclick: () => addLayer(vecLayer({ d: s.d, vb: s.vb, evenodd: s.evenodd, fill: artColor() }, s.name, `shape ${s.id}`, PW * 0.6), `Added ${s.name.toLowerCase()}.`) },
          svgEl(s.vb, s.d, s.evenodd)))));
  }

  // ---------- patterns (pattern maker) ----------
  const ex = geo ? { ...geo.randomize(), palette: geo.defaultPalette(false) } : null;
  let exUrl = "";
  const exName = () => `${geo.STYLES.find(([k]) => k === ex.style)[1]} · ${geo.PALETTES.find((x) => x.id === ex.palette).name}`;
  function drawExplore() {
    if (!geo) return;
    if (exUrl) URL.revokeObjectURL(exUrl);
    exUrl = URL.createObjectURL(new Blob([geo.generate(ex)], { type: "image/svg+xml" }));
    const set = (k, v) => { ex[k] = v; drawExplore(); };
    put(artBody,
      h("p", { class: "muted small" }, "Make a one-of-a-kind pattern. Shuffle until you love it, then add it to your shirt."),
      h("div", { class: "sb-explore" },
        h("img", { src: exUrl, alt: `${exName()} pattern preview`, width: 360, height: 360 })),
      h("div", { class: "sb-btnrow sb-explore-go" },
        h("button", { type: "button", class: "btn", onclick: () => set("seed", geo.newSeed()) }, "Shuffle"),
        h("button", { type: "button", class: "btn ghost", onclick: () => { Object.assign(ex, geo.randomize()); drawExplore(); } }, "Surprise me"),
        h("button", { type: "button", class: "btn brass", onclick: () => addPattern() }, "Add to shirt")),
      h("h3", { class: "sb-h3" }, "Style"), pills("Pattern style", geo.STYLES, ex.style, (k) => set("style", k)),
      h("h3", { class: "sb-h3" }, "Colors"),
      h("div", { class: "sb-pals", role: "radiogroup", "aria-label": "Pattern colors" }, geo.PALETTES.map((pl) =>
        h("button", { type: "button", role: "radio", class: "sb-pal", "aria-checked": String(pl.id === ex.palette), onclick: () => set("palette", pl.id) },
          h("span", { class: "sb-pal-sw", "aria-hidden": "true" }, pl.colors.map((c) => h("i", { style: `background:${c}` }))), pl.name))),
      h("h3", { class: "sb-h3" }, "Shape"), pills("Pattern shape", geo.SHAPES, ex.shape, (k) => set("shape", k)),
      range("Detail", 3, 12, 1, ex.density, (v, done) => { if (done) set("density", v); }).el,
      h("p", { class: "muted small" }, "Design code ", h("code", {}, geo.codeOf(ex)), ". Tip: after adding, use Edit to recolor it or add effects."),
    );
  }
  async function patternSource(o) {
    const name = `${geo.STYLES.find(([k]) => k === o.style)[1]} · ${geo.PALETTES.find((x) => x.id === o.palette).name}`;
    const id = await addSource(new Blob([geo.generate(o)], { type: "image/svg+xml" }), name, "explore", null);
    sources.get(id).code = geo.codeOf(o);
    return { id, name };
  }
  async function addPattern() {
    await busy("Adding your design…", async () => {
      const { id, name } = await patternSource({ ...ex });
      addImageLayer(id, name);
    }).catch((e) => say(e.message || "That design couldn't be added.", "err"));
  }

  // ---------- text tab ----------
  function drawTextTab() {
    const fill = (o, k = kit()) => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, typeof v === "string" && v[0] === "$" ? k[v.slice(1)] : v]));
    const styles = TEXT_STYLES.filter(([, o]) => fontByName.has(o.font));
    put(panels.Text,
      h("h2", { class: "sb-h" }, "Text"),
      h("button", { type: "button", class: "btn", onclick: () => addText() }, "Add plain text"),
      styles.length ? [h("h3", { class: "sb-h3" }, "Or start from a look"),
        h("div", { class: "sb-looks" }, styles.map(([name, o]) => {
          const b = h("button", { type: "button", class: "sb-look", onclick: () => addText({ value: o.value ?? name, ...fill(o) }) }, name);
          loadFont(o.font).then(() => { b.style.fontFamily = `"${o.font}"`; });
          return b;
        }))] : null,
      h("p", { class: "muted small" }, `${fontList.length} fonts, curved and wavy text, outlines, shadows and gradients. Style it under Edit.`));
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
      h("p", { class: "muted small" }, "After you add it, open Edit to remove the background, clean up halftone dots, add effects like halftone, distress or a sticker outline, and get it ready for DTF printing."),
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
  async function addSource(blobIn, name, from, file, id = `S${++uid}`) {
    const full = await decode(blobIn, MAX_SRC);
    const preview = full.width > PREVIEW || full.height > PREVIEW ? downscale(full, PREVIEW) : full;
    sources.set(id, { full, preview, blob: blobIn, name, from, file });
    return id;
  }

  // ---------- draw ----------
  const pen = { on: false, color: null, size: 0.15, straight: false };
  const drawing = () => pen.on && !panels.Draw.hidden;
  const MIN_LINE = 0.08; // inches (2 mm): thinner lines don't hold up on DTF
  function drawDraw() {
    put(panels.Draw,
      h("h2", { class: "sb-h" }, "Draw"),
      h("p", { class: "muted small" }, pen.on ? "Drag on the shirt to draw. Each line becomes its own layer you can move, recolor or outline." : "Drawing is paused, so you can move art. Turn the pen back on to draw."),
      h("div", { class: "sb-btnrow" },
        h("button", { type: "button", class: `btn small ${pen.on ? "" : "ghost"}`, "aria-pressed": String(pen.on), onclick: () => { pen.on = !pen.on; area.classList.toggle("is-drawing", drawing()); drawDraw(); } }, pen.on ? "Pen on" : "Pen off")),
      h("label", { class: "sb-row" }, h("span", {}, "Color"), h("input", { type: "color", value: pen.color ?? ink(), "aria-label": "Pen color", onchange: (e) => { pen.color = e.target.value; } })),
      range("Size (in)", MIN_LINE, 1.5, 0.01, pen.size, (v) => { pen.size = v; }).el,
      h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: pen.straight, onchange: (e) => { pen.straight = e.target.checked; } }), " Straight lines (or hold Shift)"),
      h("p", { class: "muted small" }, "Lines thinner than 2 mm don't print well, so the pen starts there."));
  }
  function startStroke(p) {
    const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), path = document.createElementNS(ns, "path");
    s.setAttribute("class", "sb-ink"); s.setAttribute("viewBox", `0 0 ${PW} ${PH}`); s.setAttribute("preserveAspectRatio", "none");
    path.setAttribute("fill", "none"); path.setAttribute("stroke", pen.color ?? ink()); path.setAttribute("stroke-width", pen.size);
    path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
    s.append(path); area.append(s);
    stroke = { pts: [p], path, svg: s };
    moveStroke(p, false);
  }
  function moveStroke(p, shift) {
    const last = stroke.pts.at(-1);
    if (stroke.pts.length > 1 && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.03) return;
    stroke.pts.push(p);
    const pts = pen.straight || shift ? [stroke.pts[0], p] : stroke.pts;
    stroke.straight = pen.straight || shift;
    stroke.path.setAttribute("d", `M${pts.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join(" L")}`);
  }
  function endStroke() {
    const pts = stroke.straight ? [stroke.pts[0], stroke.pts.at(-1)] : stroke.pts;
    stroke.svg.remove(); stroke = null;
    const P = ds.strokePath(pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]));
    const unit = Math.max(P.vb[0], P.vb[1]) / 100, lw = Math.max(MIN_LINE, pen.size) * 100; // path units are 1/100 inch
    const vec = { ...vecDefaults(), d: P.d, vb: P.vb, fill: pen.color ?? ink(), line: lw / unit };
    const pad = lw / 2 + 2; // matches renderVec's padding with no outline or shadow
    const l = { ...baseLayer("vec", "Drawing"), art: "drawing", vec,
      x: P.x + P.vb[0] / 200, y: P.y + P.vb[1] / 200, w: (P.vb[0] + pad * 2) / 100, h: (P.vb[1] + pad * 2) / 100 };
    layers().push(l); S.sel = null; commit(); drawAll();
  }

  // ---------- layers ----------
  function drawLayers() {
    const ls = layers();
    const thumb = (l) => {
      const c = h("canvas", { width: 44, height: 44, class: "sb-lthumb", "aria-hidden": "true" }), b = canvasFor(l), ctx = c.getContext("2d");
      const k = Math.min(40 / b.width, 40 / b.height);
      ctx.drawImage(b, 22 - b.width * k / 2, 22 - b.height * k / 2, b.width * k, b.height * k);
      return c;
    };
    const act = (label, fn, pressed) => h("button", { type: "button", class: "sb-iconbtn", "aria-label": label, title: label, "aria-pressed": pressed == null ? null : String(pressed), onclick: fn }, ...icon(label));
    const then = (fn) => () => { fn(); commit(); drawAll(); drawLayers(); };
    put(panels.Layers,
      h("h2", { class: "sb-h" }, "Layers"),
      h("p", { class: "muted small" }, ls.length ? `${ls.length} on the ${S.side}. The top of the list prints on top.` : `Nothing on the ${S.side} yet.`),
      ls.length ? h("ol", { class: "sb-layers" }, [...ls].reverse().map((l) => {
        const i = ls.indexOf(l);
        return h("li", { class: `${l.id === S.sel ? "sel" : ""}${l.hidden ? " off" : ""}` },
          h("button", { type: "button", class: "sb-lpick", onclick: () => { S.sel = l.id; drawStage(); drawLayers(); } }, thumb(l), h("span", {}, l.name, l.hidden ? h("small", { class: "muted" }, " hidden") : null)),
          act(l.hidden ? "Show" : "Hide", then(() => { l.hidden = !l.hidden; if (l.hidden && S.sel === l.id) S.sel = null; }), l.hidden),
          act(l.locked ? "Unlock" : "Lock", then(() => { l.locked = !l.locked; }), l.locked),
          act("Move up", then(() => move(l, 1)), null),
          act("Move down", then(() => move(l, -1)), null),
          act("Delete", () => removeLayer(l), null));
      })) : null,
      h("p", { class: "muted small" }, "Tip: Ctrl+D copies the selected layer, arrow keys nudge it, Delete removes it."));
  }

  // ---------- ideas ----------
  const ideaThumbs = new Map(); // template id + shirt color -> data URL
  function specText(sp) {
    const t = { ...textDefaults(), value: sp.value };
    for (const key of ["font", "color", "outline", "outlineW", "outline2", "outline2W", "spacing", "curve", "warp", "grad", "gradAngle", "shadow", "shadowX", "shadowY", "upper", "lineH", "align"]) if (sp[key] != null) t[key] = sp[key];
    if (sp.curve == null) t.curve = 0;
    return t;
  }
  function specVec(sp) {
    if (sp.t === "icon") { const i = art.icons?.icons.find((x) => x.n === sp.id); return i ? { ...vecDefaults(), d: i.d, vb: [art.icons.vb, art.icons.vb], fill: sp.fill } : null; }
    const s = ds.SHAPES.find((x) => x.id === sp.id);
    return s ? { ...vecDefaults(), d: s.d, vb: s.vb, evenodd: s.evenodd, fill: sp.fill, outline: sp.outline ?? "#000000", outlineW: sp.outlineW ?? 0 } : null;
  }
  const ideaList = () => (tplMod?.TEMPLATES ?? []).filter((t) => (t.needs !== "pattern" || geo) && (cfg.artUrl || !t.build(kit()).some((sp) => sp.t === "icon")));
  const ideaFonts = (t) => [...new Set(t.build(kit(t.accent)).filter((sp) => sp.t === "text").map((sp) => sp.font))];
  async function ideaThumb(t) {
    const key = `${t.id}|${S.color}|${styleOf()}`;
    if (ideaThumbs.has(key)) return ideaThumbs.get(key);
    await Promise.all(ideaFonts(t).map(loadFont));
    const px = 560;
    const c = await shirtPhoto("front", px, async (ctx, ax, ay, s) => {
      for (const sp of t.build(kit(t.accent))) {
        let bmp = null;
        if (sp.t === "text") bmp = ds.renderText(specText(sp), 48);
        else if (sp.t === "pattern") bmp = await svgToImage(geo.generate(geo.normalize(sp)), 300, 300);
        else { const v = specVec(sp); if (v) bmp = ds.renderVec(v, 160); }
        if (!bmp) continue;
        const w = sp.w * s, hh = w * (bmp.height / bmp.width);
        ctx.drawImage(bmp, ax + sp.x * s - w / 2, ay + sp.y * s - hh / 2, w, hh);
      }
    });
    // crop to the chest, 3:4
    const a = areaBox("front"), cw = a.w * px * 1.5, ch = cw * 4 / 3, cx = (a.x + a.w / 2) * px, cy = a.y * px - cw * 0.12;
    const out = document.createElement("canvas"); out.width = 240; out.height = 320;
    out.getContext("2d").drawImage(c, cx - cw / 2, cy, cw, ch, 0, 0, 240, 320);
    const url = out.toDataURL("image/jpeg", 0.86);
    ideaThumbs.set(key, url);
    return url;
  }
  async function applyIdea(t) {
    await busy(`Adding the ${t.name} idea…`, async () => {
      await loadArt();
      const k = kit(t.accent), sx = PW / 12, sy = PH / 16, s = Math.min(sx, sy), out = [];
      await Promise.all(ideaFonts(t).map(loadFont));
      for (const sp of t.build(k)) {
        let l;
        if (sp.t === "text") { l = textLayer(specText(sp), sp.w * s); }
        else if (sp.t === "pattern") {
          const { id, name } = await patternSource(geo.normalize(sp));
          l = imageLayer(id, name);
          const ar = l.h / l.w; l.w = sp.w * s; l.h = l.w * ar;
        } else {
          const v = specVec(sp);
          if (!v) continue;
          l = vecLayer(v, sp.t === "icon" ? cap(sp.id) : ds.SHAPES.find((x) => x.id === sp.id).name, `${sp.t === "icon" ? "clip art" : "shape"} ${sp.id}`, sp.w * s);
        }
        l.x = sp.x * sx; l.y = sp.y * sy;
        out.push(l);
      }
      const had = layers().length;
      S.layers[S.side] = out; S.sel = null; commit(); drawAll();
      say(had ? `Swapped in the ${t.name} idea. Undo brings your last design back.` : `Added the ${t.name} idea. Tap any part to change it.`, "ok");
    }).catch((e) => { console.error(e); say("That idea couldn't be added. Please try another.", "err"); });
  }
  async function drawIdeas() {
    const p = panels.Ideas;
    const list = ideaList();
    const grid = h("div", { class: "sb-ideas", role: "list" }, list.map((t) => {
      const im = h("img", { alt: "", width: 150, height: 200 });
      ideaThumb(t).then((u) => { im.src = u; }).catch(() => {});
      return h("button", { type: "button", role: "listitem", class: "sb-idea", onclick: () => applyIdea(t) }, im, h("span", {}, t.name));
    }));
    const mine = h("div", {});
    put(p, h("h2", { class: "sb-h" }, "Ideas"),
      h("p", { class: "muted small" }, `Pick a starting point for the ${S.side}. Every part is yours to change: words, fonts, colors and art.`),
      mine, grid);
    if (list.some((t) => t.build(kit()).some((sp) => sp.t === "icon")) && !art.icons) loadArt().then(() => { if (!p.hidden && art.icons) { ideaThumbs.clear(); drawIdeas(); } });
    drawSaved(mine);
  }

  // ---------- saved designs (this browser only) ----------
  async function record(id, name) {
    const used = new Set([...S.layers.front, ...S.layers.back].filter((l) => l.type === "image").map((l) => l.src));
    const srcs = {};
    for (const sid of used) { const s = sources.get(sid); srcs[sid] = { blob: s.blob, name: s.name, from: s.from, code: s.code ?? null, fileName: s.file?.name ?? null }; }
    const b = blank();
    return { id, name, thumb: await renderThumb(), state: { layers: S.layers, color: S.color, blank: b ? (b.handle ?? b.title) : null, size: S.size, side: S.side }, sources: srcs };
  }
  async function openRecord(rec) {
    await busy("Opening your design…", async () => {
      const map = new Map();
      for (const [sid, s] of Object.entries(rec.sources ?? {})) {
        const file = s.fileName && s.from === "upload" ? new File([s.blob], s.fileName, { type: s.blob.type }) : null;
        const id = await addSource(file ?? s.blob, s.name, s.from, file);
        if (s.code) sources.get(id).code = s.code;
        map.set(sid, id);
      }
      const fix = (ls) => ls.filter((l) => l.type !== "image" || map.has(l.src)).map((l) => ({ ...l, id: `L${++uid}`, ...(l.type === "image" ? { src: map.get(l.src) } : {}) }));
      const st = rec.state;
      const bi = blanks.findIndex((b) => (b.handle ?? b.title) === st.blank);
      if (bi >= 0) S.blank = bi;
      if (colorsOf(blank()).includes(st.color)) S.color = st.color;
      S.size = st.size ?? S.size;
      S.layers = { front: fix(st.layers.front ?? []), back: fix(st.layers.back ?? []) };
      S.side = st.side === "back" ? "back" : "front"; S.sel = null;
      await Promise.all([...S.layers.front, ...S.layers.back].filter((l) => l.type === "text").map((l) => loadFont(l.text.font)));
      rendered.clear(); commit(); drawAll();
      say(`Opened ${rec.name}.`, "ok");
    }).catch((e) => { console.error(e); say("That design couldn't be opened.", "err"); });
  }
  async function saveDesign() {
    if (!saves) return;
    if (![...S.layers.front, ...S.layers.back].length) return say("Add something to your shirt first, then save it.", "warn");
    const name = `Design ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    const ok = await saves.save(await record(`d${Date.now().toString(36)}`, name));
    say(ok === null ? "Saving isn't available in this browser (private windows block it)." : `Saved as "${name}". Find it under ${tplMod ? "Ideas" : "Order"} → Your designs.`, ok === null ? "warn" : "ok");
    if (!panels.Ideas?.hidden) drawIdeas();
    if (!panels.Order.hidden) drawOrder();
  }
  async function drawSaved(el) {
    if (!saves) return;
    const list = await saves.list();
    if (!list.length) { put(el); return; }
    put(el, h("h3", { class: "sb-h3" }, "Your designs"),
      h("ul", { class: "sb-saved" }, list.map((r) => h("li", {},
        r.thumb ? h("img", { src: r.thumb, alt: "", width: 60, height: 72 }) : null,
        h("span", {}, r.name),
        h("button", { type: "button", class: "btn ghost small", onclick: () => openRecord(r) }, "Open"),
        h("button", { type: "button", class: "sb-iconbtn", "aria-label": `Delete ${r.name}`, title: "Delete", onclick: async () => { await saves.remove(r.id); drawSaved(el); } }, ...icon("Delete"))))),
      h("p", { class: "muted small" }, "Saved on this device only."));
  }
  // Autosave: the last design comes back after a refresh. Starts once the customer has decided about an old draft.
  let autosave = false, draftTimer;
  const autosaveSoon = () => {
    if (!saves || !autosave) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      if ([...S.layers.front, ...S.layers.back].length) await saves.save(await record("draft", "Last design"));
      else await saves.remove("draft");
    }, 1500);
  };
  async function offerDraft() {
    const d = saves ? await saves.get("draft") : null;
    if (!d || ![...(d.state?.layers?.front ?? []), ...(d.state?.layers?.back ?? [])].length) { autosave = true; return; }
    const close = () => { notice.hidden = true; put(notice); autosave = true; };
    put(notice, d.thumb ? h("img", { src: d.thumb, alt: "", width: 40, height: 48 }) : null,
      h("span", {}, "Welcome back! Pick up your last design?"),
      h("button", { type: "button", class: "btn small", onclick: async () => { close(); await openRecord(d); } }, "Open it"),
      h("button", { type: "button", class: "btn ghost small", onclick: async () => { close(); await saves.save({ ...d, id: `d${Date.now().toString(36)}`, name: "Earlier design" }); await saves.remove("draft"); say("Your last design is kept under Ideas → Your designs."); } }, "Start fresh"));
    notice.hidden = false;
  }

  // ---------- edit ----------
  function drawEdit() {
    const p = panels.Edit;
    const l = selLayer();
    if (!l) { put(p, h("h2", { class: "sb-h" }, "Edit"), h("p", { class: "muted" }, "Tap a design on the shirt (or pick one under Layers) to edit it.")); return; }
    const apply = (fn, save = true) => { fn(); drawStage(); if (save) commit(); };
    const align = (where) => apply(() => {
      const b = boundsOf([l]);
      if (where === "left") l.x -= b.x; else if (where === "right") l.x += PW - (b.x + b.w); else if (where === "center") l.x = PW / 2;
      else if (where === "top") l.y -= b.y; else if (where === "bottom") l.y += PH - (b.y + b.h); else l.y = PH / 2;
    });
    const common = h("div", { class: "sb-group" },
      h("h3", { class: "sb-h3" }, "Size and position"),
      numIn("Width (in)", l.w, 0.25, PW * 1.5, (v) => apply(() => { const r = l.h / l.w; l.w = v; if (l.aspectLock !== false) l.h = v * r; })),
      numIn("Height (in)", l.h, 0.25, PH * 1.5, (v) => apply(() => { const r = l.w / l.h; l.h = v; if (l.aspectLock !== false) l.w = v * r; })),
      h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: l.aspectLock !== false, onchange: (e) => apply(() => { l.aspectLock = e.target.checked; }) }), " Keep proportions"),
      range("Rotate", -180, 180, 1, l.rot, (v, done) => { l.rot = v; drawStage(); if (done) commit(); }).el,
      h("div", { class: "sb-btnrow", role: "group", "aria-label": "Align on the print area" },
        ...[["left", "Left"], ["center", "Center"], ["right", "Right"], ["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]].map(([k, t]) => btn(t, () => align(k)))),
      h("div", { class: "sb-btnrow" },
        btn("Flip ↔", () => apply(() => { l.flipX = !l.flipX; })),
        btn("Flip ↕", () => apply(() => { l.flipY = !l.flipY; })),
        btn("Fit width", () => apply(() => { const r = l.h / l.w; l.w = PW * 0.95; l.h = l.w * r; if (l.h > PH) { l.h = PH * 0.95; l.w = l.h / r; } l.x = PW / 2; l.y = l.h / 2 + 0.25; }))),
      h("div", { class: "sb-btnrow" },
        btn("Bring forward", () => apply(() => move(l, 1))), btn("Send back", () => apply(() => move(l, -1))),
        btn("Duplicate", () => duplicate(l)),
        btn(l.locked ? "Unlock" : "Lock", () => apply(() => { l.locked = !l.locked; drawEdit(); })),
        btn("Delete", () => removeLayer(l), "danger")));
    put(p, h("h2", { class: "sb-h" }, `Edit: ${l.name}`), l.type === "text" ? textControls(l) : l.type === "vec" ? vecControls(l) : imageControls(l), common);
  }

  // shared fill / gradient / outline / shadow controls for text and vector art
  function paintControls(o, redraw, { fillKey, outlineMax = 10, shadowMax = 15 }) {
    return [
      colorIn("Color", o[fillKey], (v) => { o[fillKey] = v; redraw(false); }),
      h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: !!o.grad, onchange: (e) => { o.grad = e.target.checked ? (o.grad || "#ff2e88") : null; redraw(true); drawEdit(); } }), " Gradient"),
      o.grad ? [colorIn("Fade to", o.grad, (v) => { o.grad = v; redraw(false); }), range("Direction", 0, 360, 5, o.gradAngle ?? 90, (v, done) => { o.gradAngle = v; redraw(done); }).el] : null,
      colorIn("Outline", o.outline, (v) => { o.outline = v; redraw(false); }),
      range("Outline width", 0, outlineMax, 0.5, o.outlineW ?? 0, (v, done) => { o.outlineW = v; redraw(done); }).el,
      h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: !!o.shadow, onchange: (e) => { o.shadow = e.target.checked ? (o.shadowColor || (shirtDark() ? "#000000" : "#888888")) : null; redraw(true); drawEdit(); } }), " Shadow"),
      o.shadow ? [colorIn("Shadow color", o.shadow, (v) => { o.shadow = o.shadowColor = v; redraw(false); }),
        range("Shadow x", -shadowMax, shadowMax, 0.5, o.shadowX ?? 4, (v, done) => { o.shadowX = v; redraw(done); }).el,
        range("Shadow y", -shadowMax, shadowMax, 0.5, o.shadowY ?? 4, (v, done) => { o.shadowY = v; redraw(done); }).el] : null,
    ];
  }

  let fontPick = { open: false, group: popular.length ? "Popular" : fontGroups[0] ?? "", q: "" };
  function fontPicker(t, redraw) {
    const wrap = h("div", { class: "sb-fontpick" });
    const render = () => {
      if (!fontPick.open) { put(wrap); return; }
      const q = fontPick.q.toLowerCase().trim();
      const list = q ? fontList.filter((f) => f.name.toLowerCase().includes(q) || f.group.toLowerCase().includes(q))
        : fontPick.group === "Popular" ? popular.map((n) => fontByName.get(n)) : fontPick.group ? fontList.filter((f) => f.group === fontPick.group) : fontList;
      const search = h("input", { class: "field", type: "search", placeholder: "Search fonts", value: fontPick.q, "aria-label": "Search fonts" });
      search.addEventListener("input", debounce(() => { fontPick.q = search.value; render(); wrap.querySelector("input[type=search]")?.focus(); }, 150));
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const b = e.target; io.unobserve(b); loadFont(b.dataset.font).then(() => { b.style.fontFamily = `"${b.dataset.font}", system-ui`; }); } }), { root: null, rootMargin: "200px" });
      const grid = h("div", { class: "sb-fonts", role: "radiogroup", "aria-label": "Font" }, list.map((f) => {
        const b = h("button", { type: "button", role: "radio", class: "sb-font", "aria-checked": String(f.name === t.font), "data-font": f.name, title: f.name,
          onclick: () => { t.font = f.name; fontPick.open = false; redraw(true); drawEdit(); } }, t.value.split("\n")[0].slice(0, 14) || f.name, h("small", {}, f.name));
        io.observe(b);
        return b;
      }));
      put(wrap, fontGroups.length > 1 ? h("div", { class: "sb-chips", role: "radiogroup", "aria-label": "Font style" }, fontGroups.map((g) =>
        h("button", { type: "button", role: "radio", class: "sb-pill sm", "aria-checked": String(!q && g === fontPick.group), onclick: () => { fontPick.group = g; fontPick.q = ""; render(); } }, g))) : null,
      fontList.length > 12 ? search : null, grid);
    };
    render();
    const toggle = h("button", { type: "button", class: "sb-fontbtn", "aria-expanded": String(fontPick.open), style: `font-family:"${t.font}", system-ui`,
      onclick: () => { fontPick.open = !fontPick.open; toggle.setAttribute("aria-expanded", String(fontPick.open)); render(); } }, t.font, h("span", { "aria-hidden": "true" }, " ▾"));
    return [h("div", { class: "sb-row" }, h("span", {}, "Font"), toggle), wrap];
  }

  function textControls(l) {
    const t = l.text;
    const redraw = async (save) => { await loadFont(t.font); rendered.delete(l.id); const r = l.w; fitTextBox(l); l.w = r; fitTextBox(l); l.name = nameOf(t.value); drawStage(); if (save) commit(); };
    const ta = h("textarea", { class: "field sb-textinput", rows: 3, "aria-label": "Your text", placeholder: "Type your text", maxlength: 200 }, t.value);
    ta.addEventListener("input", debounce(() => { t.value = ta.value; redraw(false); }, 200));
    ta.addEventListener("change", () => commit());
    const warpRow = h("div", { class: "sb-group" },
      h("h3", { class: "sb-h3" }, "Shape"),
      pills("Text shape", ds.WARPS, t.curve ? t.warp ?? "arc" : "none", (k) => {
        if (k === "none") t.curve = 0; else { t.curve = k === "circle" ? 100 : t.warp === "circle" || !t.curve ? 35 : t.curve; t.warp = k; }
        redraw(true); drawEdit();
      }),
      t.curve ? range(t.warp === "circle" ? "How far round" : "Amount", -100, 100, 1, t.curve, (v, done) => { t.curve = v; redraw(done); }).el : null);
    return h("div", {},
      h("div", { class: "sb-group" },
        ta,
        ...fontPicker(t, redraw),
        h("div", { class: "sb-btnrow" },
          h("button", { type: "button", class: "sb-pill", "aria-pressed": String(!!t.upper), onclick: () => { t.upper = !t.upper; redraw(true); drawEdit(); } }, "ABC caps"),
          ...["left", "center", "right"].map((a) => h("button", { type: "button", class: "sb-pill", "aria-pressed": String(t.align === a), onclick: () => { t.align = a; redraw(true); drawEdit(); } }, a[0].toUpperCase() + a.slice(1))))),
      h("div", { class: "sb-group" }, h("h3", { class: "sb-h3" }, "Color and effects"),
        ...paintControls(t, redraw, { fillKey: "color" }),
        range("Second outline", 0, 10, 0.5, t.outline2W ?? 0, (v, done) => { t.outline2W = v; redraw(done); }).el,
        (t.outline2W ?? 0) > 0 ? colorIn("Second color", t.outline2 ?? "#ffffff", (v) => { t.outline2 = v; redraw(false); }) : null),
      warpRow,
      h("div", { class: "sb-group" }, h("h3", { class: "sb-h3" }, "Spacing"),
        range("Letters", -10, 60, 1, t.spacing ?? 0, (v, done) => { t.spacing = v; redraw(done); }).el,
        range("Lines", 0.7, 2, 0.05, t.lineH ?? 1.15, (v, done) => { t.lineH = v; redraw(done); }).el),
    );
  }

  function vecControls(l) {
    const v = l.vec;
    const redraw = (save) => { rerender(l); drawStage(); if (save) commit(); };
    return h("div", { class: "sb-group" },
      h("h3", { class: "sb-h3" }, "Color and effects"),
      ...paintControls(v, redraw, { fillKey: "fill", outlineMax: 15 }),
      v.line ? range("Line width", 1, 60, 0.5, v.line, (x, done) => { v.line = x; redraw(done); }).el : null,
      h("p", { class: "muted small" }, l.art === "drawing" ? "A line you drew. Outline it to make it pop." : "Vector art stays sharp at any size."));
  }

  function imageControls(l) {
    const o = l.ops;
    const src = sources.get(l.src);
    const rerun = async (save = true) => {
      await busy("Working on your image…", async () => { rerender(l); drawStage(); });
      say(""); if (save) commit(); drawSizeLine();
    };
    const toggle = (label, key, help, val = true) => h("label", { class: "sb-check" },
      h("input", { type: "checkbox", checked: !!o[key], onchange: (e) => { o[key] = e.target.checked ? val : 0; rerun(); drawEdit(); } }), ` ${label}`, help ? h("small", { class: "muted" }, ` ${help}`) : null);
    const slider = (label, key, min, max, step, def = 0) => range(label, min, max, step, o[key] ?? def, debounce((v, done) => { o[key] = v; rerun(done); }, 150)).el;
    const color = (label, key, def) => h("label", { class: "sb-row" }, h("span", {}, label), h("input", { type: "color", value: o[key] ?? def, "aria-label": label, onchange: (e) => { o[key] = e.target.value; rerun(); } }));
    const fx = (label, key, on, body) => h("div", { class: "sb-fx" },
      h("button", { type: "button", class: "sb-pill", "aria-pressed": String(!!o[key]), onclick: () => { o[key] = o[key] ? 0 : on; rerun(); drawEdit(); } }, label),
      o[key] ? h("div", { class: "sb-fx-body" }, body) : null);
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
        h("h3", { class: "sb-h3" }, "Styles"),
        h("p", { class: "muted small" }, "Stack as many as you like. Every effect prints solid, so it holds up on DTF."),
        fx("Halftone dots", "half", 1.6, [slider("Dot size", "half", 0.8, 5, 0.1, 1.6), slider("Angle", "halfAngle", 0, 90, 1, 45),
          pills("Dots follow", [["dark", "Dark areas"], ["light", "Light areas"], ["solid", "Even"]], o.halfBy ?? "dark", (k) => { o.halfBy = k; rerun(); drawEdit(); }),
          h("label", { class: "sb-check" }, h("input", { type: "checkbox", checked: !!o.halfInk, onchange: (e) => { o.halfInk = e.target.checked ? ink() : null; rerun(); drawEdit(); } }), " One ink color"),
          o.halfInk ? color("Ink", "halfInk", ink()) : null]),
        fx("Distressed", "distress", 40, [slider("Wear", "distress", 5, 100, 1, 40), btn("New texture", () => { o.distressSeed = Math.floor(Math.random() * 1e6); rerun(); })]),
        fx("Sticker outline", "stroke", 2, [slider("Width", "stroke", 0.5, 8, 0.1, 2), color("Outline color", "strokeColor", "#ffffff")]),
        fx("Drop shadow", "shadow", 1, [slider("Shadow x", "shadowX", -8, 8, 0.1, 3), slider("Shadow y", "shadowY", -8, 8, 0.1, 3), color("Shadow color", "shadowColor", "#000000")]),
        fx("Two-tone", "duo", 1, [color("Darks", "duoA", "#1b1b1d"), color("Lights", "duoB", "#ff2e88")]),
        fx("Stencil", "stencil", 128, [slider("Cutoff", "stencil", 20, 235, 1, 128), color("Ink", "stencilInk", ink())]),
        fx("Posterize", "poster", 5, [slider("Colors", "poster", 2, 12, 1, 5)]),
        fx("Pixel art", "pixel", 2, [slider("Pixel size", "pixel", 0.5, 8, 0.1, 2)]),
        fx("Shape cut", "mask", "circle", [pills("Shape", img.MASKS, o.mask, (k) => { o.mask = k; rerun(); drawEdit(); })])),
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
  // effects that grow the canvas are left out when trimming, so the crop maps back onto the source
  const GROWS = ["stroke", "shadow"];
  function trimLayer(l) {
    const src = sources.get(l.src);
    const base = l.crop ? cropImage(src.preview, l.crop) : src.preview;
    const flat = Object.fromEntries(Object.entries(l.ops).filter(([k2]) => k2 !== "dtf" && !GROWS.includes(k2)));
    const { image, x, y } = img.trimTransparent(process(src.preview, flat, l.crop, 1));
    if (!image.width || (image.width === base.width && image.height === base.height)) return say("Nothing to trim.");
    const before = rendered.get(l.id)?.canvas ?? canvasFor(l);
    const prev = l.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const fx = prev.w / base.width, fy = prev.h / base.height;
    // work in source pixels: how big one source pixel is on the shirt right now (outline padding excluded)
    const kx = l.w / before.width, ky = l.h / before.height;
    l.crop = { x: prev.x + x * fx, y: prev.y + y * fy, w: image.width * fx, h: image.height * fy };
    // move the box centre to where the kept pixels already sit, respecting flips and rotation
    const dx = (x + image.width / 2 - base.width / 2) * kx * (l.flipX ? -1 : 1), dy = (y + image.height / 2 - base.height / 2) * ky * (l.flipY ? -1 : 1);
    const a = l.rot * Math.PI / 180;
    l.x += dx * Math.cos(a) - dy * Math.sin(a); l.y += dx * Math.sin(a) + dy * Math.cos(a);
    rendered.delete(l.id);
    const after = canvasFor(l);
    l.w = after.width * kx; l.h = after.height * ky;
    commit(); drawAll(); say("Trimmed.");
  }

  // ---------- order ----------
  function drawOrder() {
    const v = variant(), b = blank();
    const qty = h("input", { class: "field", type: "number", min: 1, max: 99, value: S.qty, "aria-label": "Quantity", onchange: (e) => { S.qty = clamp(Math.round(Number(e.target.value) || 1), 1, 99); e.target.value = S.qty; drawOrder(); } });
    const fb = clipBox(boundsOf(shown(S.layers.front))), bb = clipBox(boundsOf(shown(S.layers.back)));
    const addBtn = h("button", { type: "button", class: "btn brass full", disabled: !v || !v.available || (!fb && !bb), onclick: () => addToCart(addBtn) }, "Add to cart");
    const any = !!(fb || bb);
    const mine = h("div", {});
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
      any ? h("div", { class: "sb-btnrow sb-share" },
        btn("Download mockup", () => downloadMockup()),
        canShareFiles() ? btn("Share", () => shareMockup()) : null,
        saves ? btn("Save design", () => saveDesign()) : null) : null,
      tplMod ? null : mine,
    );
    if (!tplMod) drawSaved(mine);
  }
  const lowDpiLayers = () => shown([...S.layers.front, ...S.layers.back]).filter((l) => {
    if (l.type !== "image") return false;
    const s = sources.get(l.src), f = cropFrac(l);
    return img.printStats(s.full.width * f.w * (l.ops.upscale || 1), s.full.height * f.h * (l.ops.upscale || 1), l.w, l.h).level === "low";
  });
  const canShareFiles = () => { try { return !!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] }); } catch { return false; } };
  async function downloadMockup() {
    await busy("Making your mockup…", async () => {
      const url = URL.createObjectURL(await renderMockup());
      const a = h("a", { href: url, download: `${idPrefix.toLowerCase()}-shirt-design.png` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      say("Mockup downloaded.", "ok");
    });
  }
  async function shareMockup() {
    try {
      const file = new File([await renderMockup()], `${idPrefix.toLowerCase()}-shirt-design.png`, { type: "image/png" });
      await navigator.share({ files: [file], title: "My shirt design", text: cfg.shareText || "Check out the shirt I designed!" });
    } catch (e) { if (e?.name !== "AbortError") say("Sharing isn't available here. Try Download mockup instead.", "warn"); }
  }

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
          const ls = shown(S.layers[side]);
          if (!ls.length || !clipBox(boundsOf(ls))) continue;
          const out = await renderPrint(ls);
          const label = side === "front" ? "Front" : "Back";
          fd.append(`properties[${label} print size]`, `${fmtIn(out.bounds.w)} wide × ${fmtIn(out.bounds.h)} tall`);
          fd.append(`properties[_${label} placement]`, `${fmtIn(out.bounds.y)} down from top of print area, ${placementX(out.bounds, PW)}`);
          fd.append(`properties[_${label} print DPI]`, String(out.dpi));
          fd.append(`properties[_${label} print file]`, new File([out.blob], `${designId}-${side}.png`, { type: "image/png" }));
          used.push(...ls.map((l) => `${label}: ${artLabel(l)}`));
        }
        const mock = await renderMockup();
        fd.append("properties[_Mockup]", new File([mock], `${designId}-mockup.png`, { type: "image/png" }));
        const uploads = [...new Set(shown([...S.layers.front, ...S.layers.back]).filter((l) => l.type === "image" && sources.get(l.src).file).map((l) => l.src))].slice(0, 2);
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
  // what the print shop sees in the order for each layer
  function artLabel(l) {
    if (l.type === "text") return `text "${l.text.value.replace(/\s*\n\s*/g, " / ").slice(0, 40)}" (${l.text.font})`;
    if (l.type === "vec") return l.art || l.name;
    const s = sources.get(l.src);
    return s.from === "upload" ? "customer upload" : s.code ? `${l.name} pattern ${s.code}` : l.name;
  }

  // full-resolution print file for one side, cropped to the art and clipped to the print area
  async function renderPrint(ls) {
    const bb = clipBox(boundsOf(ls));
    if (!bb) throw new Error("Your design is outside the print area. Move it onto the shirt.");
    const bmps = ls.map((l) => l.type === "text" ? textAt(l.text, l.h * DPI) : l.type === "vec" ? vecAt(l.vec, l.w * DPI) : toCanvas(process(sources.get(l.src).full, l.ops, l.crop, "full")));
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
    const probe = ds.renderText(t, 160);
    const byHeight = 160 * targetPx / probe.height;
    const byArea = 160 * Math.sqrt(MAX_PX / (probe.width * probe.height));
    return ds.renderText(t, Math.max(160, Math.min(byHeight, byArea, 2400)));
  }
  // vector art drawn at the target width in pixels, within the canvas cap
  function vecAt(v, targetPx) {
    const probe = ds.renderVec(v, 100);
    const byWidth = 100 * targetPx / probe.width;
    const byArea = 100 * Math.sqrt(MAX_PX / (probe.width * probe.height));
    return ds.renderVec(v, Math.max(100, Math.min(byWidth, byArea)));
  }
  const clipBox = (b) => {
    if (!b) return null;
    const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y), x1 = Math.min(PW, b.x + b.w), y1 = Math.min(PH, b.y + b.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const outside = (ls) => { const b = boundsOf(shown(ls)); return !!b && (b.x < -0.05 || b.y < -0.05 || b.x + b.w > PW + 0.05 || b.y + b.h > PH + 0.05); };

  // draws one side's layers onto ctx, with the print area at (ax, ay) and s pixels per inch
  function paintSide(ctx, side, ax, ay, s) {
    ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, PW * s, PH * s); ctx.clip();
    for (const l of shown(S.layers[side])) {
      const bmp = canvasFor(l);
      ctx.save();
      ctx.translate(ax + l.x * s, ay + l.y * s); ctx.rotate(l.rot * Math.PI / 180); ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1);
      ctx.drawImage(bmp, -l.w * s / 2, -l.h * s / 2, l.w * s, l.h * s); ctx.restore();
    }
    ctx.restore();
  }
  async function renderMockup() {
    const W = 1080;
    const c = document.createElement("canvas"); c.width = W * 2; c.height = W;
    const ctx = c.getContext("2d");
    for (const [i, side] of ["front", "back"].entries()) {
      ctx.drawImage(await shirtPhoto(side, W, (x, ax, ay, s) => paintSide(x, side, ax, ay, s)), i * W, 0);
      ctx.fillStyle = "#6b6b6b"; ctx.font = "500 26px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(side === "front" ? "Front" : "Back", i * W + W / 2, W - 28);
    }
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  // small picture of the side with art, for saved designs
  async function renderThumb() {
    const side = shown(S.layers.front).length || !shown(S.layers.back).length ? "front" : "back";
    const c = await shirtPhoto(side, 240, (x, ax, ay, s) => paintSide(x, side, ax, ay, s));
    return c.toDataURL("image/jpeg", 0.85);
  }

  // ---------- undo and shortcuts ----------
  function undo() { if (history.past.length < 2) return; history.future.push(history.past.pop()); restore(history.past.at(-1)); syncUndo(); }
  function redo() { const s = history.future.pop(); if (!s) return; history.past.push(s); restore(s); syncUndo(); }
  function syncUndo() { undoBtn.disabled = history.past.length < 2; redoBtn.disabled = !history.future.length; }
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Escape" && S.sel) { S.sel = null; drawStage(); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    else if (k === "d" && selLayer()) { e.preventDefault(); duplicate(selLayer()); }
    else if (k === "s" && saves) { e.preventDefault(); saveDesign(); }
  });
  let dirty = false;
  const markDirty = () => { dirty = [...S.layers.front, ...S.layers.back].length > 0 && !(saves && autosave); };
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
  drawTextTab();
  drawUpload();
  drawAll();
  if (geo) ex.palette = geo.defaultPalette(shirtDark());
  commit();
  loadFont(textFont);
  drawLibraryTab();
  loadLibrary().then(() => drawLibraryTab());
  offerDraft();
}

// tiny inline icons for the layer buttons, drawn with currentColor
const ICONS = {
  Hide: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  Show: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6",
  Lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  Unlock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 7.5-2",
  "Move up": "M12 19V5M5 12l7-7 7 7",
  "Move down": "M12 5v14M5 12l7 7 7-7",
  Delete: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
};
function icon(name) {
  const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"), p = document.createElementNS(ns, "path");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true");
  p.setAttribute("d", ICONS[name] ?? ""); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return [s];
}
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

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

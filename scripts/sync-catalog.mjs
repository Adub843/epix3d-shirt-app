// Builds catalog.json from the Elevated Designs store's public product feed for one collection.
// No token needed: /collections/<handle>/products.json is public on every Shopify store.
// Usage: node scripts/sync-catalog.mjs https://elevatedshirts.com builder-blanks
import { readFileSync, writeFileSync } from "node:fs";

// Style details (type, tier, fabric, swatch colors) come from data/styles.json, matched by product handle.
const styles = new Map(JSON.parse(readFileSync(new URL("../data/styles.json", import.meta.url), "utf8")).styles.map((b) => [b.id, b]));

const [store = process.env.STORE_URL, handle = process.env.BLANKS_COLLECTION || "builder-blanks"] = process.argv.slice(2);
if (!store) { console.error("Give the store address, e.g. https://elevatedshirts.com"); process.exit(1); }

const products = [];
for (let page = 1; page < 20; page++) {
  const res = await fetch(`${store.replace(/\/+$/, "")}/collections/${encodeURIComponent(handle)}/products.json?limit=250&page=${page}`);
  if (!res.ok) throw new Error(`Store answered ${res.status} for collection "${handle}"`);
  const batch = (await res.json()).products ?? [];
  products.push(...batch);
  if (batch.length < 250) break;
}

const optIndex = (p, words) => (p.options ?? []).findIndex((o) => words.some((w) => o.name.toLowerCase().includes(w))) + 1;
const blanks = products.map((p) => ({
  ...styleInfo(styles.get(p.handle)),
  id: p.id,
  handle: p.handle,
  title: p.title,
  vendor: p.vendor,
  image: p.images?.[0]?.src ? `${p.images[0].src}${p.images[0].src.includes("?") ? "&" : "?"}width=400` : null,
  description: String(p.body_html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
  colorIndex: optIndex(p, ["color", "colour"]),
  sizeIndex: optIndex(p, ["size"]),
  variants: (p.variants ?? []).map((v) => ({
    id: v.id,
    price: Math.round(Number(v.price) * 100),
    available: v.available !== false,
    options: [v.option1, v.option2, v.option3].filter((o) => o != null),
  })),
})).filter((b) => b.variants.length);

function styleInfo(st) {
  if (!st) return {};
  return { type: st.type, tier: st.tier, fabric: st.fabric, colorHex: Object.fromEntries(st.colors.map((c) => [c.name, c.hex])) };
}

writeFileSync(new URL("../catalog.json", import.meta.url), JSON.stringify({ updated: new Date().toISOString(), store, blanks }, null, 1));
console.log(`catalog.json: ${blanks.length} shirts, ${blanks.reduce((n, b) => n + b.variants.length, 0)} variants`);

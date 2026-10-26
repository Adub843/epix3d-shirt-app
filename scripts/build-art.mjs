// Builds art/icons.json, the built-in clip art, from Phosphor Icons (MIT, https://phosphoricons.com).
// Uses the solid "fill" weight, which prints well. Brand logos are left out (they're trademarks).
// Usage: npm pack @phosphor-icons/core@2.1.1 && tar xzf phosphor-icons-core-2.1.1.tgz
//        node scripts/build-art.mjs <path to the unpacked package>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pkg = process.argv[2];
if (!pkg) { console.error("usage: node scripts/build-art.mjs <phosphor core package dir>"); process.exit(1); }
const { icons } = await import(pathToFileURL(path.join(pkg, "dist/index.mjs")));
const GROUPS = {
  "weather & nature": "Nature", people: "People", games: "Fun & games", "maps & travel": "Travel", "health & wellness": "Health & sport",
  media: "Music & media", commerce: "Shopping", design: "Design", "security & warnings": "Signs", arrows: "Arrows", "math & finance": "Money",
  "time": "Time", communication: "Talk", education: "School", "office & editing": "Office", "system & devices": "Tech", "technology & development": "Tech",
};
const order = [...new Set(Object.values(GROUPS))];
const out = [];
for (const ic of icons) {
  if (ic.categories?.includes("brands") || ic.figma_category === "brands") continue;
  const file = path.join(pkg, "assets/fill", `${ic.name}-fill.svg`);
  if (!fs.existsSync(file)) continue;
  const svg = fs.readFileSync(file, "utf8");
  if (/<(circle|rect|line|polygon|polyline|ellipse)\b/.test(svg)) continue; // paths only, so the app can draw them directly
  const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
  if (!d) continue;
  const g = GROUPS[ic.figma_category] ?? "Design";
  const tags = [...new Set(ic.tags.filter((t) => !t.startsWith("*")).map((t) => t.toLowerCase()))].join(" ");
  out.push({ n: ic.name.replace(/-/g, " "), g: order.indexOf(g), t: tags, d });
}
out.sort((a, b) => a.g - b.g || a.n.localeCompare(b.n));
const data = { source: "Phosphor Icons 2.1.1 (MIT), fill weight", vb: 256, groups: order, icons: out };
fs.mkdirSync("art", { recursive: true });
fs.writeFileSync("art/icons.json", JSON.stringify(data));
console.log(`${out.length} icons in ${order.length} groups, ${(fs.statSync("art/icons.json").size / 1024).toFixed(0)} KB`);

// Starter designs for the Ideas tab. Each one is a short list of layers (text, badge shapes, clip art and
// patterns) laid out on a 12 x 16 inch print area; the builder scales them to its own print area. Colors come
// from the shirt: `ink` always contrasts with it and the accents are picked to read on it, so every idea
// looks right on any shirt color. Everything is editable once added.
//
// Layer kinds:
//   { t: "text", value, font, x, y, w, ...text style }   w is the width in inches; the height follows the text
//   { t: "shape", id, x, y, w, fill, outline, outlineW }  id from design.js SHAPES
//   { t: "icon", id, x, y, w, fill }                       id from art/icons.json
//   { t: "pattern", style, palette, shape, density, seed, x, y, w }   needs the pattern maker (geometry.js)

// Accent sets: [on a dark shirt, on a light shirt]
const ACCENTS = {
  neon: [["#c8ff2e", "#ff2e88", "#2ee6ff"], ["#ff2e88", "#1a7cff", "#111111"]],
  sunset: [["#ffb000", "#ff5c39", "#ff2e88"], ["#ff5c39", "#c2185b", "#ffb000"]],
  varsity: [["#ffc72c", "#d62828", "#ffffff"], ["#b3262e", "#1f2a44", "#ffc72c"]],
  earth: [["#e8c07d", "#8fbf7f", "#d9734e"], ["#7a4a2a", "#3f6b43", "#d9734e"]],
  pastel: [["#ffb3c7", "#a5d8ff", "#ffe69c"], ["#e86a92", "#4c8fd6", "#f2b53a"]],
  mono: [["#ffffff", "#bdbdbd", "#ffffff"], ["#111111", "#555555", "#111111"]],
  chrome: [["#e0e7ff", "#7c8bff", "#ff6ad5"], ["#3b3fd1", "#8b5cf6", "#ff2e88"]],
};
export function colorsFor(shirtIsDark, accent = "varsity") {
  const [a, b, c] = ACCENTS[accent][shirtIsDark ? 0 : 1];
  return { ink: shirtIsDark ? "#ffffff" : "#111111", paper: shirtIsDark ? "#111111" : "#ffffff", a, b, c, dark: shirtIsDark };
}

export const TEMPLATES = [
  {
    id: "varsity", name: "Varsity", accent: "varsity",
    build: (k) => [
      { t: "text", value: "HOMETOWN", font: "Graduate", x: 6, y: 2.6, w: 10, color: k.a, outline: k.ink, outlineW: 3, warp: "arc", curve: 32 },
      { t: "text", value: "26", font: "Graduate", x: 6, y: 7.6, w: 7, color: k.b, outline: k.ink, outlineW: 4, outline2: k.a, outline2W: 3 },
      { t: "text", value: "EST. 2026", font: "Graduate", x: 6, y: 11.4, w: 4.5, color: k.ink, spacing: 18 },
    ],
  },
  {
    id: "sunset", name: "Retro sunset", accent: "sunset", needs: "pattern",
    build: (k) => [
      { t: "pattern", style: "sunset", palette: "sunset", shape: "circle", density: 6, seed: 4242, x: 6, y: 6, w: 8.5 },
      { t: "text", value: "Stay Golden", font: "Shrikhand", x: 6, y: 10.6, w: 10.5, color: k.a, shadow: k.dark ? "#000000" : k.b, shadowX: 6, shadowY: 6, warp: "rise", curve: -14 },
    ],
  },
  {
    id: "street", name: "Street tag", accent: "mono",
    build: (k) => [
      { t: "text", value: "NO RULES", font: "Sedgwick Ave Display", x: 6, y: 4.5, w: 11, color: k.a, outline: k.paper, outlineW: 4, outline2: k.b, outline2W: 3, warp: "rise", curve: -18 },
      { t: "icon", id: "crown", x: 9.6, y: 1.6, w: 2.6, fill: k.b },
      { t: "text", value: "worldwide", font: "Permanent Marker", x: 6, y: 8.4, w: 5, color: k.ink },
    ],
  },
  {
    id: "y2k", name: "Y2K chrome", accent: "chrome",
    build: (k) => [
      { t: "shape", id: "star6", x: 6, y: 6.2, w: 9, fill: k.b },
      { t: "text", value: "CYBER\nBABY", font: "Rampart One", x: 6, y: 6.2, w: 8, color: k.a, grad: k.c, gradAngle: 180, outline: k.paper, outlineW: 3, lineH: 1 },
    ],
  },
  {
    id: "minimal", name: "Minimal", accent: "mono",
    build: (k) => [
      { t: "text", value: "LESS BUT BETTER", font: "Montserrat", x: 6, y: 2.2, w: 8, color: k.ink, spacing: 30 },
      { t: "shape", id: "stripe", x: 6, y: 3.3, w: 2, fill: k.ink },
    ],
  },
  {
    id: "seal", name: "Badge seal", accent: "earth",
    build: (k) => [
      { t: "shape", id: "seal", x: 6, y: 6, w: 9.5, fill: k.a },
      { t: "shape", id: "circle", x: 6, y: 6, w: 7.2, fill: k.paper },
      { t: "text", value: "• GOOD VIBES ONLY • GOOD VIBES ONLY", font: "Russo One", x: 6, y: 6, w: 6.6, color: k.a, warp: "circle", curve: 100 },
      { t: "icon", id: "sun horizon", x: 6, y: 6, w: 3.2, fill: k.b },
    ],
  },
  {
    id: "label", name: "Vintage label", accent: "earth",
    build: (k) => [
      { t: "shape", id: "banner", x: 6, y: 5, w: 11, fill: k.a },
      { t: "text", value: "Wild West", font: "Rye", x: 6, y: 5, w: 6.8, color: k.paper },
      { t: "text", value: "SUPPLY CO.", font: "Rye", x: 6, y: 8.6, w: 5, color: k.ink, spacing: 12 },
      { t: "icon", id: "cactus", x: 6, y: 1.6, w: 2.2, fill: k.b },
    ],
  },
  {
    id: "neon", name: "Neon sign", accent: "mono",
    build: (k) => [
      { t: "text", value: "Open Late", font: "Monoton", x: 6, y: 4.2, w: 10.5, color: k.b },
      { t: "text", value: "all night long", font: "Satisfy", x: 6, y: 7.2, w: 6, color: k.c },
    ],
  },
  {
    id: "skate", name: "Skate", accent: "mono",
    build: (k) => [
      { t: "shape", id: "bolt", x: 6, y: 6, w: 6.5, fill: k.a, outline: k.paper, outlineW: 3 },
      { t: "text", value: "RIDE FAST", font: "Bangers", x: 6, y: 3.2, w: 10.5, color: k.ink, outline: k.paper, outlineW: 4, shadow: k.b, shadowX: 5, shadowY: 5 },
      { t: "text", value: "LIVE LOUD", font: "Bangers", x: 6, y: 10.2, w: 8, color: k.ink, outline: k.paper, outlineW: 4 },
    ],
  },
  {
    id: "geo", name: "Geometric", accent: "mono", needs: "pattern",
    build: (k) => [
      { t: "pattern", style: "hex", palette: k.dark ? "neon" : "street", shape: "shield", density: 7, seed: 777, x: 6, y: 6, w: 8 },
      { t: "text", value: "BUILT DIFFERENT", font: "Unbounded", x: 6, y: 11.6, w: 9, color: k.ink, spacing: 6 },
    ],
  },
  {
    id: "jersey", name: "Jersey number", accent: "varsity",
    build: (k) => [
      { t: "text", value: "ALL STARS", font: "Big Shoulders Display", x: 6, y: 2.2, w: 7, color: k.ink, spacing: 20, warp: "arc", curve: 20 },
      { t: "text", value: "07", font: "Big Shoulders Display", x: 6, y: 7.4, w: 7.5, color: k.a, outline: k.ink, outlineW: 3, outline2: k.b, outline2W: 3 },
    ],
  },
  {
    id: "script", name: "Script", accent: "pastel",
    build: (k) => [
      { t: "text", value: "Weekend", font: "Pacifico", x: 6, y: 3.6, w: 10, color: k.a, shadow: k.b, shadowX: 4, shadowY: 4 },
      { t: "text", value: "CLUB", font: "Montserrat", x: 6, y: 6.6, w: 3.6, color: k.ink, spacing: 40 },
    ],
  },
  {
    id: "grunge", name: "Grunge", accent: "mono",
    build: (k) => [
      { t: "icon", id: "skull", x: 6, y: 5, w: 6.5, fill: k.ink },
      { t: "text", value: "NO SLEEP", font: "Metal Mania", x: 6, y: 10.4, w: 10, color: k.ink },
    ],
  },
  {
    id: "bubble", name: "Cute bubble", accent: "pastel",
    build: (k) => [
      { t: "text", value: "so cute", font: "Rubik Bubbles", x: 6, y: 4, w: 9.5, color: k.a, outline: k.dark ? "#ffffff" : "#111111", outlineW: 3, warp: "wave", curve: 30 },
      { t: "icon", id: "heart", x: 2.6, y: 1.6, w: 1.8, fill: k.b },
      { t: "icon", id: "star", x: 9.6, y: 6.6, w: 1.6, fill: k.c },
    ],
  },
  {
    id: "tech", name: "Futuristic", accent: "chrome",
    build: (k) => [
      { t: "text", value: "SYSTEM\nONLINE", font: "Orbitron", x: 6, y: 4, w: 9, color: k.a, lineH: 1.05, spacing: 8 },
      { t: "shape", id: "chevron", x: 2, y: 8.2, w: 1.4, fill: k.b },
      { t: "shape", id: "chevron", x: 3.6, y: 8.2, w: 1.4, fill: k.b },
      { t: "shape", id: "chevron", x: 5.2, y: 8.2, w: 1.4, fill: k.b },
      { t: "text", value: "v.2026", font: "VT323", x: 9, y: 8.2, w: 3, color: k.ink },
    ],
  },
  {
    id: "stack", name: "Stacked type", accent: "sunset",
    build: (k) => [
      { t: "text", value: "WORK HARD", font: "Anton", x: 6, y: 2.4, w: 10, color: k.ink },
      { t: "text", value: "STAY HUMBLE", font: "Anton", x: 6, y: 5.2, w: 10, color: k.a },
      { t: "text", value: "PLAY HARDER", font: "Anton", x: 6, y: 8, w: 10, color: k.b },
    ],
  },
  {
    id: "emblem", name: "Outdoors emblem", accent: "earth",
    build: (k) => [
      { t: "shape", id: "frame", x: 6, y: 6, w: 9, fill: k.ink },
      { t: "icon", id: "mountains", x: 6, y: 5.4, w: 5, fill: k.a },
      { t: "text", value: "GET OUTSIDE", font: "Alfa Slab One", x: 6, y: 7.9, w: 5.4, color: k.ink },
    ],
  },
  {
    id: "groovy", name: "Groovy 70s", accent: "sunset",
    build: (k) => [
      { t: "text", value: "Far Out", font: "Shrikhand", x: 6, y: 4.2, w: 10, color: k.a, outline: k.b, outlineW: 3, outline2: k.c, outline2W: 3, warp: "wave", curve: 45 },
      { t: "icon", id: "flower lotus", x: 6, y: 8.6, w: 3, fill: k.b },
    ],
  },
  {
    id: "arcade", name: "Arcade", accent: "mono",
    build: (k) => [
      { t: "text", value: "GAME ON", font: "Press Start 2P", x: 6, y: 3, w: 10, color: k.a, shadow: k.b, shadowX: 5, shadowY: 5 },
      { t: "icon", id: "alien", x: 6, y: 7, w: 4, fill: k.c },
      { t: "text", value: "PLAYER 1", font: "Press Start 2P", x: 6, y: 10.2, w: 4.5, color: k.ink },
    ],
  },
  {
    id: "pocket", name: "Pocket hit", accent: "mono", needs: "pattern",
    build: (k) => [
      { t: "pattern", style: "truchet", palette: k.dark ? "neon" : "street", shape: "circle", density: 6, seed: 2026, x: 9, y: 2.6, w: 3.2 },
      { t: "text", value: "ORIGINAL", font: "Space Grotesk", x: 9, y: 4.8, w: 2.8, color: k.ink, spacing: 20 },
    ],
  },
  {
    id: "checker", name: "Race day", accent: "mono", needs: "pattern",
    build: (k) => [
      { t: "pattern", style: "checker", palette: k.dark ? "chalk" : "ink", shape: "square", density: 6, seed: 9, x: 6, y: 5, w: 7 },
      { t: "text", value: "FULL SPEED", font: "Russo One", x: 6, y: 5, w: 9, color: k.dark ? "#ff2e88" : "#ff5c39", outline: k.paper, outlineW: 4 },
    ],
  },
  {
    id: "cosmic", name: "Cosmic", accent: "chrome",
    build: (k) => [
      { t: "icon", id: "planet", x: 6, y: 5.2, w: 6, fill: k.a },
      { t: "icon", id: "shooting star", x: 9.8, y: 1.8, w: 2, fill: k.c },
      { t: "text", value: "SPACE CADET", font: "Audiowide", x: 6, y: 10, w: 9.5, color: k.ink, grad: k.b, gradAngle: 90 },
    ],
  },
];

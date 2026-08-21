// Cookie Crumble icons: one big chocolate-chip cookie with a bite out of it,
// on the bakery's cream wall. Bright crayon, so everything gets a thick ink
// outline — drawn as a slightly larger ink shape behind each fill, since png.js
// only fills.
//
//   $env:Path += ';C:\Program Files\nodejs'
//   node tools/make-icons.js

const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const INK = "#2a211b";
const WALL = "#ffe9c4";
const FLOOR = "#e8cfa4";
const DOUGH = "#d99a52";
const DOUGH_LT = "#e9b877";
const CHIP = "#4a3226";

// `art` scales the cookie about the centre. The maskable icon uses a smaller
// value so the art survives a circular or squircle crop.
function paint(size, art) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                       // one unit = 1% of the icon
  const mid = big / 2;

  cv.fillRect(0, 0, big, big, WALL);
  cv.fillRect(0, 74 * u, big, 26 * u, FLOOR);
  cv.fillRect(0, 72.5 * u, big, 2.2 * u, INK);

  const r = 31 * u * art;
  const o = 3.4 * u * art;
  const cy = mid + 2 * u;

  // A bite would be the obvious motif and png.js cannot draw one: with only
  // filled primitives, a wall-coloured circle over the edge takes its ink ring
  // with it and the "bite" reads as a bubble sitting on the cookie. Two cookies
  // give the same warmth with no clipping.
  const smx = mid - r * 1.02, smy = cy - r * 0.5, sr = r * 0.56;
  cv.fillCircle(smx, smy, sr + o, INK);
  cv.fillCircle(smx, smy, sr, DOUGH);
  for (const [dx, dy] of [[-0.3, 0.1], [0.24, -0.22], [0.1, 0.36]])
    cv.fillCircle(smx + sr * dx, smy + sr * dy, sr * 0.19, CHIP);

  cv.fillCircle(mid, cy, r + o, INK);
  cv.fillCircle(mid, cy, r, DOUGH);
  // A lighter crescent along the top-left, so it reads as round rather than flat.
  cv.fillCircle(mid - r * 0.18, cy - r * 0.2, r * 0.68, DOUGH_LT);
  cv.fillCircle(mid - r * 0.02, cy - r * 0.03, r * 0.6, DOUGH);

  const chips = [
    [-0.42, 0.12, 0.15], [-0.04, 0.44, 0.16], [0.36, 0.28, 0.14],
    [-0.32, -0.36, 0.13], [0.08, -0.2, 0.15], [0.48, -0.14, 0.12],
    [-0.58, 0.46, 0.11], [0.04, 0.04, 0.10], [0.3, -0.5, 0.12],
  ];
  for (const [dx, dy, cr] of chips)
    cv.fillCircle(mid + r * dx, cy + r * dy, r * cr, CHIP);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });

const files = [
  ["icon-192.png", 192, 1.0],
  ["icon-512.png", 512, 1.0],
  ["maskable-512.png", 512, 0.74],
];

for (const [name, size, art] of files) {
  fs.writeFileSync(path.join(out, name), paint(size, art));
  console.log(`icons/${name}`);
}

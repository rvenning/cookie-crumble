// Cookie Crumble icons: a teapot and a cup on the tearoom counter, against the
// bone wall. Bright and flat, so everything gets a thick ink outline — drawn as
// a slightly larger ink shape behind each fill, since png.js only fills.
//
//   $env:Path += ';C:\Program Files\nodejs'
//   node tools/make-icons.js

const fs = require("fs");
const path = require("path");
const { makeCanvas, downsample, encodePNG } = require("../lib/tools/png.js");

const INK = "#2a211b";
const WALL = "#f7e3c6";
const COUNTER = "#b8804a";
const SLAB = "#e8cba0";
const POT = "#d9576f";
const POT_LT = "#e8798c";
const CUP = "#fffdf9";
const TEA = "#c98d15";

// `art` scales the whole still life about the centre. The maskable icon uses a
// smaller value so nothing important is lost to a circular crop.
function paint(size, art) {
  const SS = 4, big = size * SS;
  const cv = makeCanvas(big);
  const u = big / 100;                       // one unit = 1% of the icon
  const mid = big / 2;
  const S = (n) => n * u * art;

  cv.fillRect(0, 0, big, big, WALL);
  // counter along the bottom
  cv.fillRect(0, 70 * u, big, 30 * u, COUNTER);
  cv.fillRect(0, 68 * u, big, 4 * u, SLAB);
  cv.fillRect(0, 67 * u, big, 1.8 * u, INK);

  const baseY = mid + S(16);

  // the cup, to the right
  const cx = mid + S(31), cw = S(16), ch = S(13);
  cv.fillRoundRect(cx - cw / 2 - S(2), baseY - ch - S(2), cw + S(4), ch + S(4), S(4), INK);
  cv.fillRoundRect(cx - cw / 2, baseY - ch, cw, ch, S(3), CUP);
  cv.fillRect(cx - cw / 2 + S(2), baseY - ch + S(2), cw - S(4), S(3.5), TEA);

  // the pot body
  const pr = S(21);
  cv.fillCircle(mid - S(6), baseY - pr * 0.86, pr + S(2.4), INK);
  cv.fillCircle(mid - S(6), baseY - pr * 0.86, pr, POT);
  cv.fillCircle(mid - S(13), baseY - pr * 1.16, pr * 0.52, POT_LT);

  // spout, left
  cv.fillTriangle(
    mid - S(24), baseY - pr * 1.05,
    mid - S(40), baseY - pr * 1.5,
    mid - S(24), baseY - pr * 0.45, INK);
  cv.fillTriangle(
    mid - S(25), baseY - pr * 1.02,
    mid - S(36), baseY - pr * 1.4,
    mid - S(25), baseY - pr * 0.6, POT);

  // handle, right — an ink ring with the wall punched back through it
  cv.fillCircle(mid + S(12), baseY - pr * 0.9, S(9), INK);
  cv.fillCircle(mid + S(12), baseY - pr * 0.9, S(5.4), POT);

  // lid and knob
  cv.fillRoundRect(mid - S(16), baseY - pr * 1.72 - S(4), S(20), S(6), S(3), INK);
  cv.fillRoundRect(mid - S(15), baseY - pr * 1.72 - S(3), S(18), S(4), S(2), POT_LT);
  cv.fillCircle(mid - S(6), baseY - pr * 1.72 - S(7), S(4.4), INK);
  cv.fillCircle(mid - S(6), baseY - pr * 1.72 - S(7), S(2.6), POT_LT);

  return encodePNG(size, size, downsample(cv.px, big, SS));
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });

for (const [name, size, art] of [
  ["icon-192.png", 192, 1.0],
  ["icon-512.png", 512, 1.0],
  ["maskable-512.png", 512, 0.72],
]) {
  fs.writeFileSync(path.join(out, name), paint(size, art));
  console.log(`icons/${name}`);
}

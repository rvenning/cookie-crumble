// `node tests/calibrate.js` — suggests one-star targets from what the bots
// actually score, and rewrites them into js/shifts.js.
//
// Targets picked by eye are how a campaign ends up with a wall in it. The rule
// here: one star is a fraction of what an ATTENTIVE player scores on the
// STARTING kit, and that fraction tightens across the campaign, so the last week
// demands a larger share of its own ceiling than the first week does. Three
// stars is 1.75x the target, so the planner should be scraping it late on.

const fs = require("fs");
const path = require("path");
const { load } = require("./load.js");
const { playShift } = require("./brain.js");

const S = load();
const { SHIFTS, upgradeLoadout } = S;
const SEEDS = [1207, 3319, 4801, 5527, 6133, 7717];
const base = () => upgradeLoadout({});

const median = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const round10 = (x) => Math.round(x / 10) * 10;

const rows = SHIFTS.map((s, i) => {
  const runs = SEEDS.map((seed) => playShift(S, { shiftIdx: i, brainName: "planner", kit: base(), seed }));
  const ord = SEEDS.map((seed) => playShift(S, { shiftIdx: i, brainName: "ordinary", kit: base(), seed }));
  const p = median(runs.map((r) => r.score));
  const o = median(ord.map((r) => r.score));
  // 0.56 at the start, 0.74 by the end: the same play is worth fewer stars later.
  // At 0.46-0.60 an ordinary child averaged 2.96 of 3 stars, which is no grade
  // at all — three stars has to cost something.
  const frac = 0.56 + 0.18 * (i / (SHIFTS.length - 1));
  return {
    i, name: s.name, planner: p, ordinary: o, frac,
    target: round10(p * frac),
    plannerWin: runs.filter((r) => r.win).length, seeds: SEEDS.length,
  };
});

console.log("  # shift                planner  ordinary   frac   target   3*needs   planner wins");
for (const r of rows)
  console.log(` ${String(r.i + 1).padStart(2)} ${r.name.padEnd(20).slice(0, 20)} ` +
    `${String(r.planner).padStart(6)}  ${String(r.ordinary).padStart(7)}   ${r.frac.toFixed(2)}  ` +
    `${String(r.target).padStart(6)}   ${String(Math.round(r.target * 1.75)).padStart(6)}   ${r.plannerWin}/${r.seeds}`);

if (process.argv.includes("--write")) {
  const p = path.join(__dirname, "..", "js", "shifts.js");
  let src = fs.readFileSync(p, "utf8");
  let k = 0;
  src = src.replace(/target: \d+/g, () => `target: ${rows[k++].target}`);
  if (k !== rows.length) throw new Error(`matched ${k} targets, expected ${rows.length}`);
  fs.writeFileSync(p, src);
  console.log(`\n  wrote ${k} targets into js/shifts.js`);
}

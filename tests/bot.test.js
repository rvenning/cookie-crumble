// Cookie Crumble — balance.
//
// Four bots, and the one that decides the tuning is the ORDINARY child who
// shops as she goes. "Perfect play with the starting kitchen" and "perfect play
// with everything bought" are both situations nobody is ever in: by the time she
// unlocks the Bake-Off she has cleared nineteen shifts and been paid for all of
// them, and she has never once saved 320 coins for the third oven. So the run
// that has to hold is the progression run — play each shift once, bank what it
// actually paid, and spend it on the cheapest thing on the shelf.
//
//   CC_REPORT=1 node --test tests/bot.test.js
//
// prints the per-shift table. Gate it on the environment, not process.argv:
// `node --test` runs each file in a child process and the argv never arrives.

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");
const { playShift } = require("./brain.js");

const S = load();
const { SHIFTS, RUSH, UPGRADES, upgradeLoadout } = S;
const REPORT = !!process.env.CC_REPORT;
const SEEDS = [1207, 3319, 4801, 5527, 6133, 7717, 8219, 9403];

const base = () => upgradeLoadout({});
const full = () => upgradeLoadout({
  upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, u.costs.length])),
});

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function pct(x) { return `${(x * 100).toFixed(0)}%`; }

// Every shift, one brain, one kitchen, averaged over the seed set. A single-seed
// table sends you tuning the shuffle: one deal swings a shift between two and
// three stars, and the next single-seed run moves the opposite way.
function sweep(brainName, kitFn) {
  return SHIFTS.map((s, i) => {
    const runs = SEEDS.map((seed) => playShift(S, { shiftIdx: i, brainName, kit: kitFn(), seed }));
    return {
      idx: i, name: s.name,
      passRate: mean(runs.map((r) => (r.win ? 1 : 0))),
      meanStars: mean(runs.map((r) => r.stars)),
      threeRate: mean(runs.map((r) => (r.stars === 3 ? 1 : 0))),
      coins: mean(runs.map((r) => r.coins)),
      lost: mean(runs.map((r) => r.lost)),
      served: mean(runs.map((r) => r.served)),
      perfectRate: mean(runs.map((r) => (r.served ? r.perfect / r.served : 0))),
      seconds: mean(runs.map((r) => r.seconds)),
      timedOut: runs.some((r) => r.timedOut),
    };
  });
}

function table(title, rows) {
  if (!REPORT) return;
  console.log(`\n=== ${title} ===`);
  console.log("  # shift                pass  stars  3★    served/lost  perfect  coins  secs");
  for (const r of rows) {
    console.log(
      ` ${String(r.idx + 1).padStart(2)} ${r.name.padEnd(20).slice(0, 20)} ` +
      `${pct(r.passRate).padStart(4)}  ${r.meanStars.toFixed(2)}  ${pct(r.threeRate).padStart(4)}  ` +
      `${r.served.toFixed(1).padStart(4)}/${r.lost.toFixed(1).padEnd(4)}  ` +
      `${pct(r.perfectRate).padStart(5)}   ${r.coins.toFixed(0).padStart(4)}  ${r.seconds.toFixed(0).padStart(4)}`
    );
  }
  const agg = (k) => mean(rows.map((r) => r[k]));
  console.log(` -- mean               ${pct(agg("passRate")).padStart(4)}  ${agg("meanStars").toFixed(2)}  ` +
    `${pct(agg("threeRate")).padStart(4)}  total coins ${rows.reduce((a, r) => a + r.coins, 0).toFixed(0)}`);
}

/* ------------------------------------------------------------------ */

test("guardrail: a kitchen with nothing bought still clears every shift", () => {
  const rows = sweep("perfect", base);
  table("perfect · starting kitchen", rows);

  const fails = rows.filter((r) => r.passRate < 1).map((r) => `${r.idx + 1}. ${r.name} ${pct(r.passRate)}`);
  assert.deepEqual(fails, [], "a shift the shop cannot be blamed for");
  assert.deepEqual(rows.filter((r) => r.timedOut).map((r) => r.name), [], "a shift that never ends");
});

test("the tuning target: an ordinary child, shopping as she goes, is never stuck", () => {
  // One campaign per seed: each shift played ONCE, in order, on whatever
  // kitchen the coins so far have paid for. Stop at the first loss — nothing
  // past there is real.
  const MAX_TRIES = 6;
  const campaigns = SEEDS.map((seed) => {
    const prog = { upgrades: {} };
    let purse = 0;
    const rows = [];
    for (let i = 0; i < SHIFTS.length; i++) {
      // She retries a shift she loses, and every attempt still pays for the
      // cookies she sold — so a bad run leaves her better equipped than it found
      // her. That is what makes "never stuck" a stronger claim than "wins first
      // time": the loop has to converge, not merely succeed once.
      let r = null, tries = 0;
      while (tries < MAX_TRIES && (!r || !r.win)) {
        tries++;
        r = playShift(S, { shiftIdx: i, brainName: "ordinary", kit: upgradeLoadout(prog), seed: seed + i * 31 + tries * 7 });
        purse += r.coins;
      }
      rows.push({ ...r, tries, purseAfter: purse, kit: JSON.parse(JSON.stringify(prog.upgrades)) });
      if (!r.win) break;
      // A deliberately pessimistic shopper: the cheapest thing she can afford,
      // right now. Nobody saves three hundred coins for the third oven.
      for (;;) {
        const buys = UPGRADES
          .map((u) => ({ u, lvl: (prog.upgrades[u.id] || 0) }))
          .filter(({ u, lvl }) => lvl < u.costs.length && u.costs[lvl] <= purse)
          .sort((a, b) => a.u.costs[a.lvl] - b.u.costs[b.lvl]);
        if (!buys.length) break;
        const { u, lvl } = buys[0];
        purse -= u.costs[lvl];
        prog.upgrades[u.id] = lvl + 1;
      }
    }
    return rows;
  });

  if (REPORT) {
    console.log("\n=== ordinary · progression (one campaign, seed " + SEEDS[0] + ") ===");
    console.log("  # shift                win  try stars  served/lost  perfect  coins  purse  bought");
    for (const [i, r] of campaigns[0].entries()) {
      console.log(
        ` ${String(i + 1).padStart(2)} ${SHIFTS[i].name.padEnd(20).slice(0, 20)} ` +
        `${(r.win ? " ✔" : " ✘")}   ${r.tries}   ${r.stars}    ${String(r.served).padStart(2)}/${String(r.lost).padEnd(2)}     ` +
        `${pct(r.served ? r.perfect / r.served : 0).padStart(5)}   ${String(r.coins).padStart(4)}  ` +
        `${String(r.purseAfter).padStart(5)}  ${Object.entries(r.kit).map(([k, v]) => k + v).join(" ")}`
      );
    }
  }

  const stuck = [];
  for (const [si, rows] of campaigns.entries()) {
    if (rows.length < SHIFTS.length || !rows[rows.length - 1].win)
      stuck.push(`seed ${SEEDS[si]} stopped at shift ${rows.length} (${SHIFTS[rows.length - 1].name})`);
  }
  assert.deepEqual(stuck, [], "losing a shift is fine; being stuck on one is not");

  // A shift you have to replay once in a while is a challenge. One you might
  // replay four times is a wall wearing a challenge's clothes.
  const tries = mean(campaigns.flat().map((r) => r.tries));
  const worst = Math.max(...campaigns.flat().map((r) => r.tries));
  if (REPORT) console.log(`\n ordinary progression: mean ${tries.toFixed(2)} attempts per shift, worst ${worst}`);
  assert.ok(tries <= 1.35, `an ordinary child replays a shift ${tries.toFixed(2)} times on average — that is a grind`);
  assert.ok(worst <= 4, `one shift took ${worst} attempts — that is a wall`);

  // She should be earning stars, not merely surviving — but not sweeping them
  // either, or the third star means nothing.
  const stars = mean(campaigns.flat().map((r) => r.stars));
  if (REPORT) console.log(`\n ordinary progression mean stars ${stars.toFixed(2)}`);
  assert.ok(stars >= 1.5, `an ordinary child averages ${stars.toFixed(2)} stars — the campaign is a grind`);
  assert.ok(stars <= 2.75, `an ordinary child averages ${stars.toFixed(2)} stars — the top grade is free`);
});

test("the control: putting the iPad down wins nothing", () => {
  const rows = sweep("idle", base);
  const won = rows.filter((r) => r.passRate > 0).map((r) => r.name);
  assert.deepEqual(won, [], "a shift that plays itself");
  assert.equal(mean(rows.map((r) => r.coins)), 0, "an idle shop still takes money");
});

test("skill pays: better play earns more, on the campaign as a whole", () => {
  const perfect = sweep("perfect", full);
  const ordinary = sweep("ordinary", full);
  const hurried = sweep("hurried", full);
  table("perfect · everything bought", perfect);
  table("ordinary · everything bought", ordinary);
  table("hurried · everything bought", hurried);

  const total = (rows) => rows.reduce((a, r) => a + r.coins, 0);
  const three = (rows) => mean(rows.map((r) => r.threeRate));

  // Compared on the campaign, never per shift: eight seeds still swing one
  // shift's three-star rate by a dozen points.
  assert.ok(total(perfect) > total(ordinary) * 1.05,
    `perfect ${total(perfect).toFixed(0)} vs ordinary ${total(ordinary).toFixed(0)} — care does not pay`);
  assert.ok(total(ordinary) > total(hurried),
    `ordinary ${total(ordinary).toFixed(0)} vs hurried ${total(hurried).toFixed(0)} — rushing is free`);
  assert.ok(three(perfect) > three(hurried) + 0.15,
    `three-star rate ${pct(three(perfect))} vs ${pct(three(hurried))} — the top grade is not about care`);
});

test("the shop is worth the coins, and does not erase the game", () => {
  const late = SHIFTS.map((_, i) => i).filter((i) => i >= 12);
  const runOne = (kit, i, seed) => playShift(S, { shiftIdx: i, brainName: "ordinary", kit, seed });

  const bare = mean(late.flatMap((i) => SEEDS.map((s) => runOne(base(), i, s).stars)));
  const kitted = mean(late.flatMap((i) => SEEDS.map((s) => runOne(full(), i, s).stars)));
  if (REPORT) console.log(`\n late shifts, ordinary child: bare ${bare.toFixed(2)}★  kitted ${kitted.toFixed(2)}★`);

  assert.ok(kitted > bare + 0.25, `the shop moves ${bare.toFixed(2)} -> ${kitted.toFixed(2)} stars — nothing on the shelf is worth buying`);

  // ...but a full kitchen must not turn the finale into a walk. The Bake-Off
  // should still take a real shift's work.
  const finale = mean(SEEDS.map((s) => runOne(full(), SHIFTS.length - 1, s).seconds));
  assert.ok(finale > 45, `the Bake-Off is over in ${finale.toFixed(0)}s with everything bought`);
});

test("The Big Rush ends, even for a faultless baker", () => {
  const runs = SEEDS.map((seed) => playShift(S, { shiftIdx: 0, brainName: "perfect", kit: base(), seed, mode: "rush", cap: 1200 }));
  const forever = runs.filter((r) => r.timedOut).length;
  assert.equal(forever, 0, "a perfect run in The Big Rush never ends — patience needs a floorless decay");

  const scores = runs.map((r) => r.score);
  const served = runs.map((r) => r.served);
  if (REPORT) {
    console.log(`\n=== The Big Rush ===`);
    console.log(` perfect: ${Math.min(...served)}-${Math.max(...served)} served, ` +
      `${Math.min(...scores)}-${Math.max(...scores)} coins, ` +
      `${mean(runs.map((r) => r.seconds)).toFixed(0)}s`);
  }
  assert.ok(mean(served) >= 12, `a faultless Big Rush only reaches ${mean(served).toFixed(1)} customers — the decay is too steep`);

  const lazy = playShift(S, { shiftIdx: 0, brainName: "idle", kit: base(), seed: 11, mode: "rush", cap: 1200 });
  assert.equal(lazy.score, 0, "doing nothing scores in the leaderboard mode");
});

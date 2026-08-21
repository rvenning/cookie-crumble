// Cookie Crumble — balance.
//
//   CC_REPORT=1 node --test tests/bot.test.js
//
// prints the per-shift table. Gate the report on the ENVIRONMENT, not argv:
// `node --test` runs each file in a child process and argv never arrives.

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");
const { playShift } = require("./brain.js");

const S = load();
const { SHIFTS, UPGRADES, upgradeLoadout } = S;
const REPORT = !!process.env.CC_REPORT;
const SEEDS = [1207, 3319, 4801, 5527, 6133, 7717, 8219, 9403];

const base = () => upgradeLoadout({});
const full = () => upgradeLoadout({ upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, u.costs.length])) });
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x) => `${(x * 100).toFixed(0)}%`;

function sweep(brainName, kitFn) {
  return SHIFTS.map((s, i) => {
    const runs = SEEDS.map((seed) => playShift(S, { shiftIdx: i, brainName, kit: kitFn(), seed }));
    return {
      idx: i, name: s.name, target: s.target,
      passRate: mean(runs.map((r) => (r.win ? 1 : 0))),
      meanStars: mean(runs.map((r) => r.stars)),
      threeRate: mean(runs.map((r) => (r.stars === 3 ? 1 : 0))),
      score: mean(runs.map((r) => r.score)),
      coins: mean(runs.map((r) => r.coins)),
      served: mean(runs.map((r) => r.served)),
      lost: mean(runs.map((r) => r.lost)),
      wasted: mean(runs.map((r) => r.wasted)),
      chain: mean(runs.map((r) => r.bestChain)),
      seconds: mean(runs.map((r) => r.seconds)),
      timedOut: runs.some((r) => r.timedOut),
    };
  });
}

function table(title, rows) {
  if (!REPORT) return;
  console.log(`\n=== ${title} ===`);
  console.log("  # shift                pass  stars  3*    score/target   served/lost  cold  chain  secs");
  for (const r of rows) {
    console.log(
      ` ${String(r.idx + 1).padStart(2)} ${r.name.padEnd(20).slice(0, 20)} ` +
      `${pct(r.passRate).padStart(4)}  ${r.meanStars.toFixed(2)}  ${pct(r.threeRate).padStart(4)}  ` +
      `${r.score.toFixed(0).padStart(5)}/${String(r.target).padEnd(5)}  ` +
      `${r.served.toFixed(1).padStart(4)}/${r.lost.toFixed(1).padEnd(4)} ` +
      `${r.wasted.toFixed(1).padStart(4)}  ${r.chain.toFixed(1).padStart(4)}  ${r.seconds.toFixed(0).padStart(4)}`
    );
  }
  const agg = (k) => mean(rows.map((r) => r[k]));
  console.log(` -- mean               ${pct(agg("passRate")).padStart(4)}  ${agg("meanStars").toFixed(2)}  ` +
    `${pct(agg("threeRate")).padStart(4)}   total coins ${rows.reduce((a, r) => a + r.coins, 0).toFixed(0)}`);
}

/* ------------------------------------------------------------------ */

test("guardrail: an attentive player on the starting kitchen is never walled", () => {
  const rows = sweep("planner", base);
  table("planner · starting kit", rows);

  // The STRICT anti-stuck guarantee lives in the progression test below, because
  // "perfect play having bought nothing in twenty shifts" is a situation nobody
  // is ever in — by the Bake-Off she has cleared nineteen and been paid for all
  // of them. What this one has to rule out is a wall: a shift a good player
  // simply cannot pass on the kit she happens to be holding.
  const walls = rows.filter((r) => r.passRate < 0.5).map((r) => `${r.idx + 1}. ${r.name} ${pct(r.passRate)}`);
  assert.deepEqual(walls, [], "a shift a good player mostly cannot pass, even unequipped");
  const overall = mean(rows.map((r) => r.passRate));
  assert.ok(overall >= 0.85, `an attentive player clears only ${pct(overall)} of shifts unequipped`);
  assert.deepEqual(rows.filter((r) => r.timedOut).map((r) => r.name), [], "a shift that never ends");
});

test("the tuning target: an ordinary child, shopping as she goes, is never stuck", () => {
  const MAX_TRIES = 6;
  const campaigns = SEEDS.map((seed) => {
    const prog = { upgrades: {} };
    let purse = 0;
    const rows = [];
    for (let i = 0; i < SHIFTS.length; i++) {
      // She retries a shift she loses, and every attempt still pays for what she
      // sold — so a bad run leaves her better equipped than it found her. That
      // is what makes "never stuck" a stronger claim than "wins first time".
      let r = null, tries = 0;
      while (tries < MAX_TRIES && (!r || !r.win)) {
        tries++;
        r = playShift(S, { shiftIdx: i, brainName: "ordinary", kit: upgradeLoadout(prog), seed: seed + i * 31 + tries * 7 });
        purse += r.coins;
      }
      rows.push({ ...r, tries, purseAfter: purse, kit: JSON.parse(JSON.stringify(prog.upgrades)) });
      if (!r.win) break;
      // A deliberately pessimistic shopper: the cheapest thing she can afford
      // right now. Nobody saves five hundred coins for the third pair of shoes.
      for (;;) {
        const buys = UPGRADES
          .map((u) => ({ u, lvl: prog.upgrades[u.id] || 0 }))
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
    console.log("\n=== ordinary · progression (seed " + SEEDS[0] + ") ===");
    console.log("  # shift                win try stars  score/target  served/lost  purse  bought");
    for (const [i, r] of campaigns[0].entries())
      console.log(
        ` ${String(i + 1).padStart(2)} ${SHIFTS[i].name.padEnd(20).slice(0, 20)} ` +
        `${r.win ? " ✔" : " ✘"}  ${r.tries}   ${r.stars}   ${String(r.score).padStart(5)}/${String(r.target).padEnd(5)}  ` +
        `${String(r.served).padStart(2)}/${String(r.lost).padEnd(2)}  ${String(r.purseAfter).padStart(5)}  ` +
        Object.entries(r.kit).map(([k, v]) => k + v).join(" "));
  }

  const stuck = [];
  for (const [si, rows] of campaigns.entries())
    if (rows.length < SHIFTS.length || !rows[rows.length - 1].win)
      stuck.push(`seed ${SEEDS[si]} stopped at shift ${rows.length} (${SHIFTS[rows.length - 1].name})`);
  assert.deepEqual(stuck, [], "losing a shift is fine; being stuck on one is not");

  const tries = mean(campaigns.flat().map((r) => r.tries));
  const worst = Math.max(...campaigns.flat().map((r) => r.tries));
  const stars = mean(campaigns.flat().map((r) => r.stars));
  if (REPORT) console.log(`\n ordinary progression: ${tries.toFixed(2)} attempts/shift (worst ${worst}), ${stars.toFixed(2)} stars`);
  assert.ok(tries <= 1.4, `an ordinary child replays a shift ${tries.toFixed(2)} times on average — that is a grind`);
  assert.ok(worst <= 4, `one shift took ${worst} attempts — that is a wall`);
  assert.ok(stars >= 1.3, `she averages ${stars.toFixed(2)} stars — the targets are too steep`);
  assert.ok(stars <= 2.8, `she averages ${stars.toFixed(2)} stars — the top grade is free`);
});

test("the control: putting the iPad down earns nothing", () => {
  const rows = sweep("idle", base);
  assert.deepEqual(rows.filter((r) => r.passRate > 0).map((r) => r.name), [], "a shift that plays itself");
  assert.equal(mean(rows.map((r) => r.score)), 0, "an empty tearoom scored points");
});

test("the choices are choices: a considered order beats any old order", () => {
  // Measured on the STARTING kitchen. With everything bought the shifts are
  // comfortable and every bot serves everybody, so no policy can separate from
  // any other — comparing there measures the shop, not the game.
  const planner = sweep("planner", base);
  const random = sweep("random", base);
  const greedy = sweep("greedy", base);
  table("planner · starting kit", planner);
  table("random · starting kit", random);

  const p = mean(planner.map((r) => r.score));
  const r = mean(random.map((r) => r.score));
  const g = mean(greedy.map((x) => x.score));

  // `random` still cooks and still does only legal jobs — it simply does not
  // care which one. If that keeps up, the whole game is a tapping exercise.
  const ps = mean(planner.map((x) => x.meanStars)), rs = mean(random.map((x) => x.meanStars));
  if (REPORT) console.log(`\n planner ${p.toFixed(0)} (${ps.toFixed(2)}*) · greedy ${g.toFixed(0)} · random ${r.toFixed(0)} (${rs.toFixed(2)}*)`);
  assert.ok(p > r * 1.10, `planner ${p.toFixed(0)} vs random ${r.toFixed(0)} — picking well is worth nothing`);
  // Stars, not pass rate. Almost anybody can finish a shift; the grade is where
  // the thinking shows, and that is the honest place to look for it.
  assert.ok(ps > rs + 0.25, `planner ${ps.toFixed(2)} stars vs random ${rs.toFixed(2)} — choosing well earns no better grade`);

  // Recorded, not asserted. Ignoring the walk entirely and simply serving
  // whoever is closest to leaving scores within about 1% of the planner: when
  // the floor is saturated you have to visit everything anyway, so triage-first
  // is very nearly optimal. Distance matters WITHIN a good policy rather than
  // instead of one, and pretending otherwise would be tuning to a false claim.
  if (REPORT) console.log(` greedy (ignores walking) is worth ${((g / p - 1) * 100).toFixed(0)}% vs the planner`);
});

test("the cast spreads out, and the chain gets built", () => {
  const ordinary = sweep("ordinary", base);
  const hurried = sweep("hurried", base);
  table("ordinary · starting kit", ordinary);
  table("hurried · starting kit", hurried);

  const stars = (rows) => mean(rows.map((r) => r.meanStars));
  const planner = stars(sweep("planner", base));
  const random = stars(sweep("random", base));
  const o = stars(ordinary), h = stars(hurried);
  if (REPORT) console.log(`\n stars — planner ${planner.toFixed(2)} · ordinary ${o.toFixed(2)} · hurried ${h.toFixed(2)} · random ${random.toFixed(2)}`);

  // An ordinary child lands between thinking and not thinking, which is exactly
  // where the tuning wants her.
  assert.ok(o < planner - 0.1, `an ordinary player grades as well as a faultless one (${o.toFixed(2)} vs ${planner.toFixed(2)})`);
  assert.ok(o > random + 0.1, `an ordinary player grades no better than random tapping (${o.toFixed(2)} vs ${random.toFixed(2)})`);

  // NOT asserted, and it surprised me: `hurried` — fast hands, poor judgement —
  // scores level with `ordinary`, who is slower and thinks harder. In a game
  // where every job has to be done eventually, tapping quickly genuinely does
  // buy back bad ordering. So "care beats hurry" is not true here and I am not
  // going to bend the bots until it looks true; the axis that IS real is
  // judgement against randomness, asserted above.
  if (REPORT) console.log(` (hurry vs care: ${h.toFixed(2)} vs ${o.toFixed(2)} — fast hands really do cover for poor judgement)`);

  // Two-and-a-bit, and that is the shape of the game rather than a tuning
  // failure — see SCORE.CHAIN_STEP. What matters is that chains happen at all
  // and that fetching no longer breaks them.
  assert.ok(mean(ordinary.map((r) => r.chain)) >= 2.2,
    `best chain averages ${mean(ordinary.map((r) => r.chain)).toFixed(1)} — nobody is chaining, so the multiplier is decoration`);
});

test("the shop is worth the coins, and does not erase the game", () => {
  const late = SHIFTS.map((_, i) => i).filter((i) => i >= 12);
  const run = (kit, i, seed) => playShift(S, { shiftIdx: i, brainName: "ordinary", kit, seed });
  const bare = mean(late.flatMap((i) => SEEDS.map((s) => run(base(), i, s).stars)));
  const kitted = mean(late.flatMap((i) => SEEDS.map((s) => run(full(), i, s).stars)));
  if (REPORT) console.log(`\n late shifts, ordinary: bare ${bare.toFixed(2)}* kitted ${kitted.toFixed(2)}*`);
  assert.ok(kitted > bare + 0.3, `the shop moves ${bare.toFixed(2)} -> ${kitted.toFixed(2)} stars — nothing on the shelf is worth buying`);

  const finale = mean(SEEDS.map((s) => run(full(), SHIFTS.length - 1, s).seconds));
  assert.ok(finale > 60, `the last shift is over in ${finale.toFixed(0)}s with everything bought`);
});

test("The Saturday Rush ends, even for a faultless server", () => {
  const runs = SEEDS.map((seed) => playShift(S, { shiftIdx: 0, brainName: "planner", kit: base(), seed, mode: "rush", cap: 1500 }));
  assert.equal(runs.filter((r) => r.timedOut).length, 0, "a perfect Rush never ends — patience needs a floorless decay");
  const served = runs.map((r) => r.served);
  if (REPORT) console.log(`\n=== The Saturday Rush ===\n planner: ${Math.min(...served)}-${Math.max(...served)} served, ` +
    `${Math.min(...runs.map((r) => r.score))}-${Math.max(...runs.map((r) => r.score))} points, ${mean(runs.map((r) => r.seconds)).toFixed(0)}s`);
  assert.ok(mean(served) >= 10, `a faultless Rush only reaches ${mean(served).toFixed(1)} parties — the decay is too steep`);

  const lazy = playShift(S, { shiftIdx: 0, brainName: "idle", kit: base(), seed: 11, mode: "rush", cap: 1500 });
  assert.equal(lazy.score, 0, "doing nothing scores in the leaderboard mode");
});

// A diagnostic, not a test. `node tests/diag.js [shiftIdx]` plays one shift with
// the planner and prints where the time actually goes — which is the only way
// to tell a mis-tuned number from a broken mechanism.
//
// Every balance question on this game so far has been answered here in one run
// after several tuning passes failed to move anything.

const { load } = require("./load.js");
const { makeBrain } = require("./brain.js");

const S = load();
const { Game: G, SHIFTS, upgradeLoadout, GUEST } = S;

const idx = Number(process.argv[2] || 0);
const kitName = process.argv[3] || "base";
const kit = kitName === "full"
  ? upgradeLoadout({ upgrades: Object.fromEntries(S.UPGRADES.map((u) => [u.id, u.costs.length])) })
  : upgradeLoadout({});

// Overrides, so the ceiling can be measured without the failure spiral dragging
// the number down: CC_GAP=20 CC_PAT=200 node tests/diag.js 19 base
const s0 = SHIFTS[idx];
if (process.env.CC_GAP) s0.gap = Number(process.env.CC_GAP);
if (process.env.CC_PAT) s0.patience = Number(process.env.CC_PAT);
if (process.env.CC_COUNT) s0.count = Number(process.env.CC_COUNT);

S.__reseed(1207);
const brain = makeBrain(S, process.argv[4] || "planner");

const lostAt = { door: 0, table: 0 };
const stageAt = new Map();     // partyId -> { arrive, seat, order, serve, clear }
const spans = { wait: [], toOrder: [], toFood: [], toClear: [] };
let refusals = 0, blocked = {};

// A ring buffer of everything that happened, so a cycle can be read off the tail
// rather than guessed at. CC_TRACE=1 prints the last 40 events.
const trace = [];
const note = (s) => { trace.push(`${G.t.toFixed(1)}s ${s}`); if (trace.length > 400) trace.shift(); };

G.on = {
  cookStart: (d) => note(`cook ${d.station} -> ${d.dish}`),
  cookDone: (d) => note(`cooked ${d.dish}${d.held ? " (HELD, pass full)" : ""}`),
  collected: (d) => note(`collected ${d.took.join("+")} (carrying ${d.carrying.join(",")})`),
  cold: (d) => note(`COLD ${d.dish}`),
  servedDish: (d) => note(`served ${d.handed} to table ${d.table.i}`),
  refused: (d) => note(`REFUSED at table ${d.table.i}: ${d.why}`),
  binned: (d) => note(`binned ${d.n}`),
  eating: (d) => note(`table ${d.table.i} eating`),
  arrive: (d) => { note(`arrive ${d.party.type} wants ${d.party.order.join("+")}`); stageAt.set(d.party.id, { arrive: G.t }); },
  seated: (d) => { const s = stageAt.get(d.party.id); if (s) { s.seat = G.t; spans.wait.push(G.t - s.arrive); } },
  ordered: (d) => { const s = stageAt.get(d.table.party.id); if (s) { s.order = G.t; spans.toOrder.push(G.t - s.seat); } },
  eating: (d) => { const s = stageAt.get(d.table.party.id); if (s) { s.serve = G.t; spans.toFood.push(G.t - s.order); } },
  paid: (d) => { const s = stageAt.get(d.party.id); if (s) spans.toClear.push(G.t - s.serve); },
  gaveUp: (d) => { lostAt[d.where]++; },
  refused: () => refusals++,
  blocked: (d) => { blocked[d.why] = (blocked[d.why] || 0) + 1; },
};

G.start({ mode: "shift", shiftIdx: idx, kit });
brain.reset();

const dt = 1 / 30;
let t = 0, walking = 0, working = 0, idleT = 0;
const qLen = [], passLen = [], freeT = [];
let sample = 0;

// If she stands still with work outstanding, something is wrong that no amount
// of tuning will fix. Dump the room the first time it happens.
let stall = 0, dumped = false;
function dumpStall() {
  dumped = true;
  console.log(`\n  !! STALL at t=${t.toFixed(1)}s — idle with work outstanding:`);
  console.log(`     queue: ${G.queue.map((p) => `${p.type}(${p.patience.toFixed(0)}s)`).join(", ") || "empty"}`);
  console.log(`     tables: ${G.tables.map((x) => `${x.i}:${x.state}${x.wants.length ? "[" + x.wants + "]" : ""}`).join("  ")}`);
  console.log(`     pass: ${G.pass.map((p) => p.dish).join(",") || "empty"}   carrying: ${G.server.carrying.join(",") || "nothing"}`);
  console.log(`     stations: ${Object.entries(G.stations).map(([k, v]) => `${k}:${v.busy ? "busy>" + v.makes : v.held ? "HELD " + v.held : "idle"}`).join("  ")}`);
  console.log(`     demand: ${JSON.stringify(G.demand())}  outstanding: ${JSON.stringify(G.outstanding())}`);
  console.log(`     collect guard: pass=${G.pass.length} carrying=${G.server.carrying.length}/${G.kit.carry} ` +
              `claimed=${G.server.tasks.filter((k) => k.kind === "collect").length}`);
  console.log(`     station dur: ${Object.entries(G.stations).map(([k, v]) => `${k} t=${v.t.toFixed(1)}/${v.dur}`).join("  ")}`);
  console.log(`     server at ${G.server.x.toFixed(0)},${G.server.y.toFixed(0)}  tasks: ` +
    (G.server.tasks.map((k) => {
      const lg = k.legs[k.leg] || {};
      return `${k.kind}${k.tableId != null ? "@" + k.tableId : ""}[leg ${k.leg}/${k.legs.length} ` +
        `t=${k.t.toFixed(1)}/${lg.dur} -> ${lg.here ? "here" : `${(lg.x || 0).toFixed(0)},${(lg.y || 0).toFixed(0)}`}]`;
    }).join("  ") || "none"));
  for (const t of G.tables) {
    if (t.state !== "ordered") continue;
    const g = S.GUEST[t.party.type];
    const spare = G.server.carrying.slice();
    const canAll = t.wants.every((d) => { const k = spare.indexOf(d); if (k < 0) return false; spare.splice(k, 1); return true; });
    const canAny = t.wants.some((d) => G.server.carrying.includes(d));
    console.log(`     table ${t.i}: ${t.party.type}${g.allAtOnce ? " ALL-AT-ONCE" : ""} wants[${t.wants}] canAny=${canAny} canAll=${canAll} servable=${g.allAtOnce ? canAll : canAny}`);
  }
  console.log(`     options: ${brain.options().map((o) => o.kind).join(",") || "NONE"}\n`);
}

while (G.running && t < 900) {
  const before = { x: G.server.x, y: G.server.y };
  brain.tick(dt);
  G.tick(dt);
  if (!G.server.tasks.length && (G.queue.length || G.tables.some((x) => x.party))) {
    stall += dt;
    if (stall > 4 && !dumped) dumpStall();
  } else stall = 0;
  const moved = Math.hypot(G.server.x - before.x, G.server.y - before.y);
  if (moved > 0.01) walking += dt;
  else if (G.server.tasks.length) working += dt;
  else idleT += dt;
  t += dt;
  if (++sample % 15 === 0) { qLen.push(G.queue.length); passLen.push(G.pass.length); freeT.push(G.freeTables().length); }
}
// A run that hits the wall clock has something it can never finish. Show it.
if (G.running) {
  console.log("\n  !! RAN OUT OF WALL CLOCK — final state:");
  dumped = false; dumpStall();
  console.log("  last events:\n" + trace.slice(-24).map((x) => "     " + x).join("\n") + "\n");
}
if (process.env.CC_TRACE) console.log("\n  events:\n" + trace.slice(-40).map((x) => "     " + x).join("\n") + "\n");
const r = G.result || { win: false, stars: 0, score: G.score, served: G.served, lost: G.lost };

const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : 0);
const s = SHIFTS[idx];
const pad = (x, n = 6) => String(x).padStart(n);

console.log(`\nSHIFT ${idx + 1} — ${s.name}   [${kitName} kit, ${process.argv[4] || "planner"}]`);
console.log(`  parties ${s.count}  gap ${s.gap}s  patience ${s.patience}s  tables ${S.ROOMS[s.room].spots.length}  menu ${s.dishes.join("/")}`);
console.log(`  RESULT  win=${r.win} stars=${r.stars} score=${r.score}/${s.target} served=${r.served} lost=${r.lost} in ${t.toFixed(0)}s`);
console.log(`\n  lost at the door ${lostAt.door}   lost at a table ${lostAt.table}`);
console.log(`\n  server time:  walking ${pad((walking / t * 100).toFixed(0))}%   working ${pad((working / t * 100).toFixed(0))}%   idle ${pad((idleT / t * 100).toFixed(0))}%`);
console.log(`\n  how long a party waits, in seconds:`);
console.log(`    door -> seated   ${pad(mean(spans.wait).toFixed(1))}   (n=${spans.wait.length})`);
console.log(`    seated -> order  ${pad(mean(spans.toOrder).toFixed(1))}   (n=${spans.toOrder.length})`);
console.log(`    order -> food    ${pad(mean(spans.toFood).toFixed(1))}   (n=${spans.toFood.length})`);
console.log(`    food -> paid     ${pad(mean(spans.toClear).toFixed(1))}   (n=${spans.toClear.length})`);
console.log(`    TOTAL            ${pad((mean(spans.wait) + mean(spans.toOrder) + mean(spans.toFood) + mean(spans.toClear)).toFixed(1))}   vs ${s.patience}s of patience`);
console.log(`\n  mean queue ${mean(qLen).toFixed(1)}/${kit.queue}   mean plates at pass ${mean(passLen).toFixed(1)}   mean free tables ${mean(freeT).toFixed(1)}`);
console.log(`  plates gone cold ${G.wasted}   serves refused ${refusals}`);
console.log(`  taps ${brain.taps}   blocked taps: ${JSON.stringify(blocked)}`);
console.log(`\n  service rate: ${(r.served / t * 60).toFixed(1)} parties/min   arrival rate: ${(60 / s.gap).toFixed(1)}/min\n`);

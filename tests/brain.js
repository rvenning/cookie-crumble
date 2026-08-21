// The bots.
//
// A routing game is a joy to bot, because the thing the player is choosing is
// exactly the thing a bot has to choose: of every job available right now, which
// one next. So the brain is one function — enumerate every legal tap, score it,
// take the best — and the interesting bots are the ones that score it WRONG in
// specific, human ways.
//
//   planner   weighs urgency against the walk. The guardrail.
//   ordinary  the same brain, at a child's tap rate, that sometimes picks the
//             wrong job and often forgets the kitchen. The tuning target.
//   hurried   faster hands, worse judgement.
//   greedy    always runs to whoever is closest to leaving and ignores the walk
//             entirely. NOT a control — it turns out to be a genuinely good
//             strategy that scores within 1% of the planner, because when the
//             floor is saturated you have to visit everything anyway and
//             triage-first is close to optimal. Kept in the report as an honest
//             finding: distance matters WITHIN a good policy, not instead of one.
//   random    picks any legal job at all. THIS is the control — if it keeps up,
//             the choices are not choices.
//   idle      does nothing at all.
//
// The kid's mistakes are NAMED rather than being one noise dial, because each
// tells you something the others cannot:
//   reaction  she taps at a child's rate
//   misread   she goes to the wrong table, and pays the walk for it
//   forget    she leaves the kitchen idle, and the pass runs dry

const BRAINS = {
  planner:  { reaction: 0.30, misread: 0.00, forget: 0.00 },
  ordinary: { reaction: 0.62, misread: 0.14, forget: 0.26 },
  hurried:  { reaction: 0.40, misread: 0.38, forget: 0.55 },
  greedy:   { reaction: 0.30, misread: 0.00, forget: 0.00, ignoreWalk: true },
  random:   { reaction: 0.30, misread: 1.00, forget: 0.00 },
  idle:     { reaction: 0.30, doNothing: true },
};

// What each job is worth attending to, before urgency and distance. `clear` is
// high because it is now two jobs in one — they settle up as you wipe the table,
// so it is both the money and the thing that frees a seat.
const WEIGHT = { serve: 1.35, order: 1.0, seat: 1.05, clear: 1.2, collect: 0.95 };

function makeBrain(S, name) {
  const o = BRAINS[name];
  const G = S.Game;
  const rand = S.__rand;                 // the SANDBOX's seeded stream

  return {
    acc: 0, taps: 0, wrong: 0,

    reset() { this.acc = 0; this.taps = 0; this.wrong = 0; },

    tick(dt) {
      if (o.doNothing) return;
      this.acc += dt;
      while (this.acc >= o.reaction) {
        this.acc -= o.reaction;
        this.act();
      }
    },

    // Where she will be standing once the queued jobs are done — planning against
    // her CURRENT position would ignore the trip she is already committed to.
    // `here` legs move her nowhere, so walk back past them to the last real one.
    endPos() {
      const tasks = G.server.tasks;
      for (let i = tasks.length - 1; i >= 0; i--) {
        const legs = tasks[i].legs;
        for (let j = legs.length - 1; j >= 0; j--)
          if (!legs[j].here) return { x: legs[j].x, y: legs[j].y };
      }
      return { x: G.server.x, y: G.server.y };
    },

    walkCost(x, y) {
      if (o.ignoreWalk) return 0.35;
      const p = this.endPos();
      return Math.hypot(p.x - x, p.y - y) / G.kit.walk;
    },

    urgency(party) {
      if (!party) return 0.5;
      return 1 - Math.max(0, Math.min(1, party.patience / party.patienceMax));
    },

    /* ---------- every legal tap, right now ---------- */

    options() {
      const out = [];
      const carrying = G.server.carrying;
      const claimed = G.server.tasks.filter((k) => k.kind === "collect").length;
      // Anything already being walked to is not a choice. Leaving these in meant
      // the bot's best-scoring option was often a job it had already committed
      // to, so it spent the tick being refused instead of doing something else.
      const busyTable = (t) => G.server.tasks.some((k) => k.tableId === t.i);

      for (const t of G.tables) {
        if (busyTable(t)) continue;
        if (t.state === "seated") out.push({ kind: "order", table: t, party: t.party, x: t.x, y: t.y + 34 });
        else if (t.state === "bill") out.push({ kind: "clear", table: t, party: t.party, paying: true, x: t.x, y: t.y + 34 });
        else if (t.state === "dirty") out.push({ kind: "clear", table: t, party: null, x: t.x, y: t.y + 34 });
        else if (t.state === "ordered") {
          const g = S.GUEST[t.party.type];
          const spare = carrying.slice();
          const canAll = t.wants.every((d) => { const k = spare.indexOf(d); if (k < 0) return false; spare.splice(k, 1); return true; });
          const canAny = t.wants.some((d) => carrying.includes(d));
          if (canAny)
            out.push({ kind: "serve", table: t, party: t.party, x: t.x, y: t.y + 34 });
        }
      }

      // Seating: every waiting party against every free table, so the colour
      // match is a choice the bot actually makes rather than a coincidence.
      const free = G.freeTables().filter((t) => !busyTable(t));
      const here = this.endPos();
      for (const p of G.queue)
        for (const t of free) {
          // Seating costs no walk unless they need escorting, so it must be
          // priced from where she already is, not from the door.
          const esc = S.GUEST[p.type].escort;
          out.push({ kind: "seat", party: p, table: t,
                     x: esc ? t.x : here.x, y: esc ? t.y + 34 : here.y,
                     match: p.cloth === t.cloth });
        }

      // One trip to the pass loads the whole tray, so this is a single option
      // rather than one per plate. Its urgency is that of the hungriest table
      // waiting for anything sitting there — pricing it at a flat middling
      // urgency was the worst bug in this file, because a visibly cross customer
      // always outbid the trip to fetch their food, so the bot took orders it
      // then never filled. Seven orders taken, one party fed, seven plates cold.
      if (G.pass.length && carrying.length < G.kit.carry && !claimed) {
        const need = G.outstanding();
        let worst = null, wanted = false;
        for (const pl of G.pass) {
          if (need[pl.dish]) wanted = true;
          for (const t of G.tables)
            if (t.state === "ordered" && t.wants.includes(pl.dish))
              if (!worst || t.party.patience / t.party.patienceMax < worst.patience / worst.patienceMax) worst = t.party;
        }
        out.push({ kind: "collect", party: worst, wanted,
                   x: S.PASS.x0 + S.PASS.step, y: S.PASS.standY });
      }

      return out;
    },

    value(a) {
      const w = WEIGHT[a.kind] || 1;
      const urg = this.urgency(a.party);
      const cost = this.walkCost(a.x, a.y) + 0.35;

      let v = w * (0.35 + urg * 1.9) / cost;
      if (a.kind === "seat") {
        // Seating a colour match is worth a detour; seating anybody at all is
        // urgent because the door drains and the queue blocks arrivals.
        if (a.match) v *= 1.5;
        v *= 0.75 + 0.5 * (G.queue.length / Math.max(1, G.kit.queue));
      }
      if (a.kind === "collect" && !a.wanted) v *= 0.35;
      // A table with the bill on it is money sitting there; an empty dirty one is
      // only worth rushing to when somebody is waiting for a seat.
      if (a.kind === "clear") {
        if (a.paying) v *= 1.4;
        else v *= (G.queue.length && !G.freeTables().length) ? 2.2 : 0.7;
      }
      // Keep the chain alive. At 1.18 the bot never bothered and best chains sat
      // at 2.1, which made the multiplier decoration; a player who actively
      // hunts chains needs to be modelled as actually hunting them.
      if (a.kind === G.chainKind) v *= 1.45;
      return v;
    },

    /* ---------- one decision ---------- */

    act() {
      // Keep the kitchen going. This is free — no walk — so a bot that forgets it
      // is modelling a child who forgets it, not a bot with bad code.
      if (rand() >= o.forget) this.cook();

      // Hands full of food nobody wants is the one genuine dead end, and the bin
      // is the only way out. Test that against what the tables RAW want — not
      // against outstanding(), which has already subtracted the very tray she is
      // holding, so carrying exactly the right order reads as carrying rubbish.
      // That one line had her fetch the correct two dishes and immediately throw
      // them away, on a loop, for the rest of the shift.
      if (G.server.carrying.length >= G.kit.carry) {
        const useful = G.server.carrying.some((d) =>
          G.tables.some((t) => t.state === "ordered" && t.wants.includes(d)));
        const coming = G.tables.some((t) => t.state === "seated");
        if (!useful && !coming) G.tapBin();
      }

      if (G.server.tasks.length >= S.TASK_QUEUE) return;

      const opts = this.options();
      if (!opts.length) return;

      let pick;
      if (rand() < o.misread) {
        pick = opts[Math.floor(rand() * opts.length)];
        this.wrong++;
      } else {
        let best = -Infinity;
        for (const a of opts) { const v = this.value(a); if (v > best) { best = v; pick = a; } }
      }
      if (!pick) return;

      this.taps++;
      if (pick.kind === "seat") {
        if (G.selected !== pick.party) G.tapQueue(pick.party.id);
        G.tapTable(pick.table.i);
      } else if (pick.kind === "collect") {
        if (G.selected) G.tapQueue(G.selected.id);
        G.tapPass();
      } else {
        if (G.selected) G.tapQueue(G.selected.id);
        G.tapTable(pick.table.i);
      }
    },

    // Put on whatever the floor is short of; failing that, keep something going
    // so the pass is never empty when an order lands.
    cook() {
      const need = G.demand();
      for (const s of S.STATIONS) {
        if (G.stationBusy(s.id)) continue;
        if (G.passFull()) break;
        const makes = Array.isArray(s.makes) ? s.makes : [s.makes];
        const useful = makes.filter((d) => G.shift.dishes.includes(d));
        if (!useful.length) continue;
        const short = useful.find((d) => (need[d] || 0) > 0);
        if (short) { G.tapStation(s.id, short); continue; }
        // Only cook on spec with an empty pass AND somebody about to order.
        // Speculating any harder buries the pass in food nobody asked for, and
        // a plate that goes cold cost a station slot it could have spent on
        // something a table was actually waiting for.
        if (!G.pass.length && G.tables.some((t) => t.state === "seated")) G.tapStation(s.id, useful[0]);
      }
    },
  };
}

// Play one shift end to end. `seed` reseeds the SANDBOX's stream, so the same
// seed gives the same day and the same mistakes whichever run asks first.
function playShift(S, { shiftIdx, brainName, kit, seed, mode = "shift", cap = 900 }) {
  S.__reseed(seed);
  const G = S.Game;
  const brain = makeBrain(S, brainName);
  G.on = {};
  G.start({ mode, shiftIdx, kit });
  brain.reset();

  const dt = 1 / 30;
  let t = 0;
  while (G.running && t < cap) {
    brain.tick(dt);
    G.tick(dt);
    t += dt;
  }
  if (G.running) { G.running = false; G.result = null; }
  return G.result || {
    mode, win: false, stars: 0, score: G.score, coins: G.coins, served: G.served,
    lost: G.lost, wasted: G.wasted, bestChain: G.bestChain, seconds: t,
    target: G.shift.target, met: {}, shiftIdx, timedOut: true,
  };
}

module.exports = { BRAINS, makeBrain, playShift };

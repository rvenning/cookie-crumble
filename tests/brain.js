// The bots. One brain, four sets of dials — because a bot that plays a
// different game from the one it is grading tells you nothing.
//
// The brain plays the genre's actual verb, which here is NOT "tap the oven at
// the right moment". It is "keep the oven full while your hands are free at the
// moment it finishes" — the timing only matters because something else is always
// competing for the one pair of hands. So the policy is a priority list with the
// oven at the top and a stash move underneath it, and everything the shop sells
// shows up as slack in that list.
//
// The kid bot's error model is written as four NAMED mistakes rather than one
// noise dial, because each says something the others cannot:
//
//   reaction      she taps at a child's rate, not a machine's
//   absorb        she is BUSY WITH THE THING IN FRONT OF HER (this is what burns)
//   misread       she reads the card wrong: wrong cutter, wrong colour
//   sprinkleSlip  she forgets the sprinkles, or adds some nobody asked for
//
// `absorb` replaced a per-step "does she glance at the oven?" coin flip, and the
// difference is the whole reason the oven is a mechanic. A coin flip RE-ROLLS:
// over a 1.4s window a bot flipping every 0.5s at 62% catches it 96% of the
// time, so every bot in the cast baked 100% perfect on every shift and the
// timing cost nothing. Attention is a STATE, not a sample — she starts mixing
// and does not look up for two seconds — and a blackout only produces misses
// when it is LONGER than the window it can hide. That single change is what
// turned the bake into something the Kitchen Timer is worth buying for.
//
// Uniform noise would have been worse than useless here: a random tap is a
// strictly worse strategy than no tap, so a "child" built out of random taps
// comes out below the do-nothing control and every conclusion drawn from the
// gap between them is backwards.

const BRAINS = {
  // Not a machine. Six taps a second with no attention cost proves "nothing is
  // unwinnable" only for something nobody is, which is the weaker claim; these
  // are an attentive grown-up's hands.
  perfect:  { reaction: 0.24, absorb: 0.45, misread: 0.00, sprinkleSlip: 0.00 },
  ordinary: { reaction: 0.50, absorb: 2.0, misread: 0.07, sprinkleSlip: 0.10 },
  hurried:  { reaction: 0.32, absorb: 2.6, misread: 0.16, sprinkleSlip: 0.20 },
  idle:     { reaction: 0.16, absorb: 0.0, misread: 0.00, sprinkleSlip: 0.00, doNothing: true },
};

function sig(o) { return `${o.shape}|${o.icing}|${o.sprinkles ? 1 : 0}`; }

function makeBrain(S, name) {
  const opts = BRAINS[name];
  const G = S.Game;
  const rand = S.__rand;                 // the SANDBOX's seeded stream, not Node's

  return {
    acc: 0,
    cutPlan: null,
    taps: 0,
    absorbed: 0,        // seconds still head-down in whatever she just started

    reset() { this.acc = 0; this.cutPlan = null; this.taps = 0; this.absorbed = 0; },

    tick(dt) {
      if (opts.doNothing) return;
      this.absorbed = Math.max(0, this.absorbed - dt);
      this.acc += dt;
      while (this.acc >= opts.reaction) {
        this.acc -= opts.reaction;
        if (this.act()) this.taps++;
      }
    },

    // Everything that is not the oven buries her in it for a moment.
    busy() { this.absorbed = opts.absorb; return true; },

    /* ---------- what is in the kitchen ---------- */

    trays() {
      const out = [];
      if (G.hands) out.push(G.hands);
      if (G.bench.tray) out.push(G.bench.tray);
      if (G.table) out.push(G.table.tray);
      for (const o of G.ovens) if (o.tray) out.push(o.tray);
      for (const r of G.rack) if (r) out.push(r);
      return out;
    },

    // Raw trays that still need an oven and are NOT in one. This is the number
    // that has to be capped: without it the bot mixes a third bowl it has
    // nowhere to put, fills both hands and the rack, and then cannot open the
    // oven door — a deadlock that reads as "this shift is unwinnable".
    queuedRaw() {
      let n = this.cutPlan ? 1 : 0;
      const inOven = new Set(G.ovens.map((o) => o.tray).filter(Boolean));
      for (const t of this.trays()) if (t.bake === "raw" && !inOven.has(t)) n++;
      return n;
    },

    // Waiting orders nobody is already baking for.
    unmet() {
      const need = new Map();
      const bump = (k, d) => need.set(k, (need.get(k) || 0) + d);
      for (const c of G.counter) bump(sig(c.order), 1);
      for (const t of this.trays()) if (t._plan) bump(sig(t._plan), -1);
      if (this.cutPlan) bump(sig(this.cutPlan), -1);
      return need;
    },

    // The most impatient customer nobody is working for.
    nextTarget() {
      const need = this.unmet();
      let best = null;
      for (const c of G.counter) {
        if ((need.get(sig(c.order)) || 0) <= 0) continue;
        if (!best || c.patience < best.patience) best = c;
      }
      return best ? best.order : null;
    },

    // Her customer left, or the tray came out of the oven a different colour
    // from the one it was meant for. Find somebody else who wants it.
    rePlan(tray) {
      const need = this.unmet();
      let best = null;
      for (const c of G.counter) {
        const o = c.order;
        if (o.shape !== tray.shape) continue;
        if (tray.icing !== "none" && o.icing !== tray.icing) continue;
        if ((need.get(sig(o)) || 0) <= 0) continue;
        if (!best || c.patience < best.patience) best = c;
      }
      if (best) tray._plan = best.order;
      return best ? best.order : null;
    },

    /* ---------- mistakes ---------- */

    // Reading the card wrong: a legal choice, just not the right one. It costs
    // exactly what it costs a person — the tray has to be remade, or scraped.
    misread(value, list) {
      if (rand() >= opts.misread || list.length < 2) return value;
      const others = list.filter((v) => v !== value && v !== "none");
      return others.length ? others[Math.floor(rand() * others.length)] : value;
    },

    /* ---------- the oven ---------- */

    // Whichever slot is closest to burning, once it is worth opening.
    ovenSlot() {
      let best = -1, worst = -1;
      for (let i = 0; i < G.ovens.length; i++) {
        const o = G.ovens[i];
        if (!o.tray) continue;
        if (o.phase === "raw") continue;
        const b = S.bakeBands(o.tray.shape, G.kit.timer);
        const over = o.tray.bakeT - b.start;
        if (over > worst) { worst = over; best = i; }
      }
      return best;
    },

    // Park what is in your hands so a hand is free for the oven door.
    stash() {
      const free = G.rack.indexOf(null);
      if (free < 0) return false;
      return G.tapRack(free).ok;
    },

    /* ---------- one tap ---------- */

    act() {
      // Adopt whatever the last cut produced.
      if (this.cutPlan) {
        const t = (G.hands && !G.hands._plan) ? G.hands
          : (G.bench.tray && !G.bench.tray._plan) ? G.bench.tray : null;
        if (t) { t._plan = this.cutPlan; this.cutPlan = null; }
      }

      if (G.hands && G.hands.bake === "burnt") return G.tapBin().ok && this.busy();

      // 1. The oven — but only if her head is up. Moving a tray between the
      // oven, her hands and the rack is all one glance, so none of it absorbs
      // her further.
      if (this.absorbed <= 0) {
        const slot = this.ovenSlot();
        if (slot >= 0) {
          if (!G.hands) return G.tapOven(slot).ok;
          if (this.stash()) return true;
          // Nowhere to put it and the tray is going dark: throw away the raw
          // one rather than lose the baked one. The escape hatch that makes a
          // deadlock impossible by construction.
          if (G.ovens[slot].phase === "crisp" && G.hands.bake === "raw") return G.tapBin().ok;
        }
      }

      // 2. Somebody wants exactly what you are holding.
      if (G.hands) {
        const c = G.counter.find((x) => S.trayFills(G.hands, x.order));
        if (c) return G.tapCustomer(c.id).ok && this.busy();
      }

      // 3. The icing table.
      if (G.table && G.table.icingT <= 0) {
        const tr = G.table.tray;
        const plan = tr._plan && this.stillWanted(tr._plan) ? tr._plan : this.rePlan(tr);
        if (plan) {
          if (plan.icing !== "none" && tr.icing !== plan.icing)
            return G.tapIcing(this.misread(plan.icing, G.icings())).ok && this.busy();
          if (G.sprinklesOn() && !!plan.sprinkles !== !!tr.sprinkles) {
            if (rand() >= opts.sprinkleSlip) return G.tapSprinkles().ok && this.busy();
          }
        }
        if (!G.hands) return G.tapTable().ok && this.busy();
      }

      // 4. A baked tray in your hands that still needs decorating.
      if (G.hands && (G.hands.bake === "perfect" || G.hands.bake === "crisp")) {
        const plan = G.hands._plan && this.stillWanted(G.hands._plan)
          ? G.hands._plan : this.rePlan(G.hands);
        if (!plan) return G.tapBin().ok && this.busy();
        const needsWork = (plan.icing !== "none" && G.hands.icing !== plan.icing)
          || (G.sprinklesOn() && !!plan.sprinkles !== !!G.hands.sprinkles);
        if (needsWork && !G.table) return G.tapTable().ok && this.busy();
        if (this.stash()) return true;
        return false;
      }

      // 5. A raw tray in your hands wants an oven.
      if (G.hands && G.hands.bake === "raw") {
        const free = G.ovens.findIndex((o) => !o.tray);
        if (free >= 0) return G.tapOven(free).ok;
        if (this.stash()) return true;
        return false;
      }

      // 6. The bench.
      if (G.bench.state === "ready" && !G.hands) return G.tapBench().ok;
      if (G.bench.state === "dough") {
        const plan = this.cutPlan || this.nextTarget();
        if (!plan) return false;
        this.cutPlan = plan;
        return G.tapCutter(this.misread(plan.shape, G.shapes())).ok && this.busy();
      }
      if (G.bench.state === "empty") {
        if (this.queuedRaw() >= G.rack.length) return false;
        if (!this.nextTarget()) return false;
        return G.tapBench().ok && this.busy();
      }
      return false;
    },

    stillWanted(order) {
      return G.counter.some((c) => S.sameOrder(c.order, order));
    },
  };
}

// Play one shift end to end. `seed` reseeds the SANDBOX's stream, so the same
// seed produces the same deal and the same mistakes whichever run asks first.
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
  // A run that hits the wall clock never finished; score it as the bust it is
  // rather than letting it silently report the last good result.
  if (G.running) { G.running = false; G.result = null; }
  return G.result || {
    mode, win: false, stars: 0, score: 0, coins: 0, served: G.served, lost: G.lost,
    perfect: G.perfect, crisp: G.crisp, binned: G.binned, wrongTries: G.wrongTries,
    seconds: t, shiftIdx, timedOut: true,
  };
}

module.exports = { BRAINS, makeBrain, playShift, sig };

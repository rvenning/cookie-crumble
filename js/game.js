// Cookie Crumble — the kitchen.
//
// No DOM, no canvas, no audio. render.js and tests/bot.test.js drive this file
// through exactly the same nine tap methods, which is what lets the balance bots
// play the real twenty-shift campaign with no browser open.
//
// Every tap returns { ok, why } and emits an event. `why` is a machine-readable
// reason, never a sentence — main.js turns it into something friendly, so the
// engine can be tested on the reason without pinning a string a child reads.
//
// Two rules hold the whole design together:
//
//   1. YOUR HANDS HOLD ONE TRAY. That is the only scarcity in the game. It is
//      what makes a second oven worth buying, what makes the cooling rack more
//      than a decoration, and what turns "the oven is ready" into a decision
//      instead of a reflex.
//   2. NOTHING IS EVER LOST BY MISTAKE. A tray pulled out early goes straight
//      back in and carries on baking; a tray offered to the wrong customer comes
//      back to your hands; a mis-iced tray can be scraped or binned. The only
//      thing a mistake costs is time, and time is what the customers are
//      counting.

const CUT_TIME = 0.8;
const ICE_TIME = 0.5;

const SCORING = {
  COINS_STAR: 10,     // per star, at the end of a passed shift
  COINS_CLEAR: 20,    // for passing at all
};

const Game = {
  running: false,
  mode: "shift",              // "shift" | "rush"
  shiftIdx: 0,
  shift: null,
  kit: null,

  t: 0,                       // seconds since the shop opened

  bench: null,                // { state, t, tray }
  ovens: [],                  // [{ tray, phase }]
  rack: [],                   // [tray | null]
  table: null,                // { tray, icingT } | null
  hands: null,                // tray | null

  counter: [],                // customers waiting to be served
  orders: [],                 // every order this shift, dealt up front
  arrived: 0,
  nextAt: 0,
  nextId: 1,

  coins: 0,                   // EARNED this run — never a balance (see storage.js)
  served: 0,
  lost: 0,
  perfect: 0,
  crisp: 0,
  binned: 0,
  wrongTries: 0,
  scraperLeft: 0,

  result: null,
  on: {},
  rand: Math.random,

  emit(name, data) { const fn = this.on[name]; if (fn) fn(data || {}); },

  /* ---------------- setup ---------------- */

  // cfg: { mode, shiftIdx, kit }
  start(cfg = {}) {
    // Re-grab Math.random every run: the test sandbox swaps it for a seeded one
    // and caching it at load time would silently ignore that.
    this.rand = Math.random;

    this.mode = cfg.mode === "rush" ? "rush" : "shift";
    this.shiftIdx = cfg.shiftIdx || 0;
    this.kit = cfg.kit || upgradeLoadout({});

    if (this.mode === "rush") {
      // Everyone plays the leaderboard mode on the same kitchen, so the Corner
      // Shop can never buy a place on the board.
      this.kit = { ...RUSH.kit };
      this.shift = {
        name: "The Big Rush", shapes: RUSH.shapes, icings: RUSH.icings,
        sprinkles: RUSH.sprinkles, maxWaiting: RUSH.maxWaiting, gap: RUSH.gap,
        first: RUSH.first, count: Infinity, maxLost: RUSH.mistakes - 1,
      };
      this.orders = [];
    } else {
      this.shift = SHIFTS[this.shiftIdx];
      this.orders = dealOrders(this.shift, this.rand);
    }

    this.t = 0;
    this.bench = { state: "empty", t: 0, tray: null };
    this.ovens = Array.from({ length: this.kit.ovens }, () => ({ tray: null, phase: null }));
    this.rack = Array.from({ length: this.kit.rack }, () => null);
    this.table = null;
    this.hands = null;

    this.counter = [];
    this.arrived = 0;
    this.nextAt = this.shift.first;
    this.nextId = 1;

    this.coins = 0;
    this.served = 0;
    this.lost = 0;
    this.perfect = 0;
    this.crisp = 0;
    this.binned = 0;
    this.wrongTries = 0;
    // The scraper is a shop item, so it stays out of the leaderboard mode.
    this.scraperLeft = this.mode === "rush" ? 0 : this.kit.scraper;

    this.result = null;
    this.running = true;
    this.emit("open", { shift: this.shift });
  },

  /* ---------------- what the player is looking at ---------------- */

  shapes() { return this.shift.shapes; },
  icings() { return this.shift.icings; },
  sprinklesOn() { return !!this.shift.sprinkles; },
  resolved() { return this.served + this.lost; },
  left() { return this.mode === "rush" ? Infinity : this.shift.count - this.resolved(); },

  // Seconds a customer arriving NOW will wait. In the campaign it is a constant
  // plus whatever the Shop Sign adds; in The Big Rush it decays with every
  // customer resolved and has no floor, so a faultless run still ends.
  patienceNow() {
    if (this.mode === "rush") return RUSH.patienceStart * Math.pow(RUSH.patienceDecay, this.resolved());
    return this.shift.patience + this.kit.patience;
  },

  // The bands the oven gauge draws, for one slot. The renderer and the engine
  // read the same function, so a green stripe on screen is exactly the window
  // the engine will call perfect.
  bandsFor(slot) {
    const o = this.ovens[slot];
    return o && o.tray ? bakeBands(o.tray.shape, this.kit.timer) : null;
  },

  /* ---------------- the bench: mix, then cut ---------------- */

  tapBench() {
    if (!this.running) return this.no("over");
    const b = this.bench;

    if (b.state === "empty") {
      b.state = "mixing"; b.t = 0;
      this.emit("mixStart", {});
      return this.yes();
    }
    // A tray finished cutting while both hands were full and is waiting here.
    if (b.state === "ready") {
      if (this.hands) return this.no("hands");
      this.hands = b.tray;
      b.state = "empty"; b.tray = null;
      this.emit("pick", { tray: this.hands, from: "bench" });
      return this.yes();
    }
    if (b.state === "dough") return this.no("pickCutter");
    return this.no("busy");
  },

  // Cutting is the one place the shape is chosen, so this is where a misread
  // order card actually costs something.
  tapCutter(shapeId) {
    if (!this.running) return this.no("over");
    if (!this.shift.shapes.includes(shapeId)) return this.no("noCutter");
    if (this.bench.state !== "dough") return this.no("noDough");
    this.bench.state = "cutting";
    this.bench.t = 0;
    this.bench.shape = shapeId;
    this.emit("cutStart", { shape: shapeId });
    return this.yes();
  },

  /* ---------------- the oven ---------------- */

  tapOven(i) {
    if (!this.running) return this.no("over");
    const o = this.ovens[i];
    if (!o) return this.no("noSlot");

    if (!o.tray) {
      if (!this.hands) return this.no("empty");
      const tray = this.hands;
      if (tray.icing !== "none" || tray.sprinkles) return this.no("iced");
      this.hands = null;
      o.tray = tray;
      o.phase = bakePhase(tray.shape, tray.bakeT, this.kit.timer);
      tray.bake = o.phase;
      this.emit("ovenIn", { slot: i, tray });
      return this.yes();
    }

    // Taking one out needs a free hand. There is always a way to make one — bin
    // what you are holding, or park it on the cooling rack — so this is a
    // planning problem and never a dead end.
    if (this.hands) return this.no("hands");
    const tray = o.tray;
    o.tray = null; o.phase = null;
    tray.bake = bakePhase(tray.shape, tray.bakeT, this.kit.timer);
    this.hands = tray;
    this.emit("ovenOut", { slot: i, tray, phase: tray.bake });
    return this.yes();
  },

  /* ---------------- the cooling rack ---------------- */

  tapRack(i) {
    if (!this.running) return this.no("over");
    if (i >= this.rack.length) return this.no("noSlot");

    if (this.rack[i]) {
      if (this.hands) return this.no("hands");
      this.hands = this.rack[i];
      this.rack[i] = null;
      this.emit("pick", { tray: this.hands, from: "rack" });
      return this.yes();
    }
    if (!this.hands) return this.no("empty");
    this.rack[i] = this.hands;
    this.hands = null;
    this.emit("park", { slot: i, tray: this.rack[i] });
    return this.yes();
  },

  /* ---------------- the icing table ---------------- */

  tapTable() {
    if (!this.running) return this.no("over");

    if (!this.table) {
      if (!this.hands) return this.no("empty");
      const tray = this.hands;
      if (tray.bake === "raw") return this.no("raw");
      if (tray.bake === "burnt") return this.no("burnt");
      this.hands = null;
      this.table = { tray, icingT: 0 };
      this.emit("tableIn", { tray });
      return this.yes();
    }
    if (this.table.icingT > 0) return this.no("busy");
    if (this.hands) return this.no("hands");
    this.hands = this.table.tray;
    this.table = null;
    this.emit("pick", { tray: this.hands, from: "table" });
    return this.yes();
  },

  tapIcing(icingId) {
    if (!this.running) return this.no("over");
    if (!this.shift.icings.includes(icingId)) return this.no("noIcing");
    if (icingId === "none") return this.no("noIcing");
    if (!this.table || this.table.icingT > 0) return this.no("noTray");

    const tray = this.table.tray;
    if (tray.icing !== "none") {
      // The scraper is the shop's forgiveness item, and it forgives rather than
      // skips: it undoes a colour already on the tray, which is the only moment
      // anybody knows they have picked the wrong one.
      if (tray.icing === icingId) return this.no("already");
      if (this.scraperLeft <= 0) return this.no("noScraper");
      this.scraperLeft--;
      this.emit("scrape", { from: tray.icing, to: icingId, left: this.scraperLeft });
    }
    tray.icing = icingId;
    this.table.icingT = ICE_TIME;
    this.emit("iced", { tray, icing: icingId });
    return this.yes();
  },

  tapSprinkles() {
    if (!this.running) return this.no("over");
    if (!this.sprinklesOn()) return this.no("noSprinkles");
    if (!this.table || this.table.icingT > 0) return this.no("noTray");
    const tray = this.table.tray;
    tray.sprinkles = !tray.sprinkles;
    this.emit("sprinkled", { tray, on: tray.sprinkles });
    return this.yes();
  },

  /* ---------------- the counter ---------------- */

  tapCustomer(id) {
    if (!this.running) return this.no("over");
    const idx = this.counter.findIndex((c) => c.id === id);
    if (idx < 0) return this.no("noCustomer");
    if (!this.hands) return this.no("empty");

    const c = this.counter[idx];
    const tray = this.hands;

    if (!trayFills(tray, c.order)) {
      // Handed back, not taken away. Offering the wrong plate costs the seconds
      // it took and nothing else.
      this.wrongTries++;
      this.emit("refused", { customer: c, tray, reason: tray.bake === "burnt" ? "burnt" : "wrong" });
      return this.no("wrong");
    }

    const frac = GK.util.clamp(c.patience / c.patienceMax, 0, 1);
    const pay = payFor(tray, frac);
    this.coins += pay.coins;
    this.served++;
    // Bake quality is counted when a tray is SOLD, never when it leaves the
    // oven: a tray can go back in for a second go, and counting at the door
    // would let one cookie earn its perfect twice and inflate the third star.
    if (tray.bake === "perfect") this.perfect++;
    else if (tray.bake === "crisp") this.crisp++;
    this.hands = null;
    this.counter.splice(idx, 1);
    this.emit("served", { customer: c, tray, coins: pay.coins, tip: pay.tip, frac });
    this.afterResolve();
    return this.yes({ coins: pay.coins });
  },

  tapBin() {
    if (!this.running) return this.no("over");
    if (!this.hands) return this.no("empty");
    const tray = this.hands;
    this.hands = null;
    this.binned++;
    this.emit("binned", { tray });
    return this.yes();
  },

  /* ---------------- time ---------------- */

  tick(dt) {
    if (!this.running) return;
    this.t += dt;

    this.tickBench(dt);
    this.tickOvens(dt);
    if (this.table && this.table.icingT > 0)
      this.table.icingT = Math.max(0, this.table.icingT - dt);

    this.tickCounter(dt);
    this.admit();
    this.checkEnd();
  },

  tickBench(dt) {
    const b = this.bench;
    if (b.state === "mixing") {
      b.t += dt;
      if (b.t >= this.kit.mix) { b.state = "dough"; b.t = 0; this.emit("mixDone", {}); }
      return;
    }
    if (b.state === "cutting") {
      b.t += dt;
      if (b.t < CUT_TIME) return;
      const tray = { shape: b.shape, icing: "none", sprinkles: false, bakeT: 0, bake: "raw" };
      b.t = 0;
      // Straight into your hands when they are free, so the common case is one
      // tap rather than two. A child should not have to pick up her own work.
      if (!this.hands) { this.hands = tray; b.state = "empty"; b.tray = null; }
      else { b.state = "ready"; b.tray = tray; }
      this.emit("cutDone", { tray, toHands: this.hands === tray });
    }
  },

  tickOvens(dt) {
    for (let i = 0; i < this.ovens.length; i++) {
      const o = this.ovens[i];
      if (!o.tray) continue;
      o.tray.bakeT += dt;
      const phase = bakePhase(o.tray.shape, o.tray.bakeT, this.kit.timer);
      if (phase !== o.phase) {
        o.phase = phase;
        o.tray.bake = phase;
        this.emit("bakePhase", { slot: i, phase, tray: o.tray });
      }
    }
  },

  tickCounter(dt) {
    for (let i = this.counter.length - 1; i >= 0; i--) {
      const c = this.counter[i];
      c.patience -= dt;
      if (c.patience > 0) continue;
      this.counter.splice(i, 1);
      this.lost++;
      this.emit("leave", { customer: c, lost: this.lost });
      this.afterResolve();
    }
  },

  // Arrivals are held back while the counter is full, so a slow baker gets a
  // longer shift rather than a hopeless one. What a shift really demands is one
  // tray every patience/maxWaiting seconds — see shifts.js.
  admit() {
    while (this.counter.length < this.shift.maxWaiting
           && this.t >= this.nextAt
           && (this.mode === "rush" || this.arrived < this.orders.length)) {
      const order = this.mode === "rush" ? this.rollOrder() : this.orders[this.arrived];
      const patience = this.patienceNow();
      const c = {
        id: this.nextId++, order, patience, patienceMax: patience, at: this.t,
      };
      this.arrived++;
      this.counter.push(c);
      this.nextAt = this.t + this.shift.gap;
      this.emit("arrive", { customer: c });
    }
  },

  rollOrder() {
    const shape = this.shift.shapes[Math.floor(this.rand() * this.shift.shapes.length)];
    const icing = this.shift.icings[Math.floor(this.rand() * this.shift.icings.length)];
    return { shape, icing, sprinkles: this.shift.sprinkles && this.rand() < 0.4 };
  },

  // Losing is checked before winning: both can become true in the same tick, and
  // the wrong order ships a "well done" for a shift that just collapsed.
  checkEnd() {
    if (!this.running) return;
    if (this.mode === "rush") {
      if (this.lost >= RUSH.mistakes) this.end(false);
      return;
    }
    if (this.lost > this.shift.maxLost) return this.end(false);
    if (this.resolved() >= this.shift.count) this.end(true);
  },

  afterResolve() { this.checkEnd(); },

  /* ---------------- the end ---------------- */

  end(finished) {
    if (!this.running) return this.result;
    this.running = false;

    let stars = 0;
    const win = this.mode === "shift" && finished && this.lost <= this.shift.maxLost;
    if (win) {
      stars = 1;
      // Two stars is "nobody went away empty-handed"; three adds "and most of
      // them were baked just right". Both are accuracy, not speed — a careful
      // player can take the whole shift and still get three.
      if (this.lost === 0) stars = 2;
      if (this.lost === 0 && this.perfect >= Math.ceil(0.75 * this.served)) stars = 3;
      this.coins += stars * SCORING.COINS_STAR + SCORING.COINS_CLEAR;
    }

    this.result = {
      mode: this.mode,
      win,
      stars,
      score: this.coins,
      coins: this.coins,
      served: this.served,
      lost: this.lost,
      perfect: this.perfect,
      crisp: this.crisp,
      binned: this.binned,
      wrongTries: this.wrongTries,
      seconds: this.t,
      shiftIdx: this.shiftIdx,
    };
    this.emit("shiftEnd", this.result);
    return this.result;
  },

  abandon() { this.running = false; this.result = null; },

  /* ---------------- tap plumbing ---------------- */

  yes(extra) { return { ok: true, ...(extra || {}) }; },
  no(why) { this.emit("blocked", { why }); return { ok: false, why }; },
};

if (typeof module !== "undefined") module.exports = {};

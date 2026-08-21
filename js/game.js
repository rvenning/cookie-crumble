// Cookie Crumble — the floor.
//
// No DOM, no canvas, no audio. render.js and tests/bot.test.js drive this file
// through the same five tap methods, which is what lets the balance bots play
// the real twenty-shift campaign with no browser open.
//
// THE ONE IDEA: every job is trivial and takes one tap. What costs you is that
// the server has to WALK there, and she can only be in one place. So the game is
// never "can I do this?" — it is always "what do I do next, and what goes cold
// while I do it?"
//
// Everything else follows from that:
//   - A plate at the pass belongs to a DISH TYPE, not to a table. When two
//     tables want cake and one cake is ready, you have to choose.
//   - Patience runs down at different rates depending on what a guest is waiting
//     FOR. Waiting for food is worse than waiting to order, and eating is free.
//   - Chaining pays for doing the same job twice running, so the quick route and
//     the high-scoring route are different routes.
//
// Nothing here can deadlock. A pass jammed with food nobody wants clears itself
// as the plates go cold, and every table can always be cleared.

const PLATE_LIFE = 26;      // seconds before an uncollected plate goes cold
const TASK_QUEUE = 3;       // the current job plus two lined up behind it
const DRAIN = { door: 1.0, seated: 1.0, ordered: 1.15, eating: 0, bill: 0.4 };

const Game = {
  running: false,
  mode: "shift",
  shiftIdx: 0,
  shift: null,
  room: null,
  kit: null,

  t: 0,
  tables: [],
  queue: [],
  plan: [],            // the parties this shift, dealt up front
  arrived: 0,
  nextAt: 0,
  nextId: 1,
  nextPlate: 1,

  pass: [],            // [{ id, dish, age }]
  stations: {},        // { urn: { busy, t, dur, makes, held } }
  server: null,
  selected: null,      // a party at the door, waiting for you to pick a table

  score: 0,
  coins: 0,
  served: 0,
  lost: 0,
  wasted: 0,           // plates that went cold
  chainKind: null,
  chainCount: 0,
  bestChain: 0,
  inspectorLost: false,

  result: null,
  on: {},
  rand: Math.random,

  emit(n, d) { const f = this.on[n]; if (f) f(d || {}); },
  yes(x) { return { ok: true, ...(x || {}) }; },
  no(why) { this.emit("blocked", { why }); return { ok: false, why }; },

  /* ---------------- setup ---------------- */

  start(cfg = {}) {
    // Re-grab Math.random every run: the test sandbox swaps it for a seeded one
    // and caching it at load would silently ignore that.
    this.rand = Math.random;

    this.mode = cfg.mode === "rush" ? "rush" : "shift";
    this.shiftIdx = cfg.shiftIdx || 0;
    this.kit = this.mode === "rush" ? { ...RUSH.kit } : (cfg.kit || upgradeLoadout({}));

    this.shift = this.mode === "rush"
      ? { name: "The Saturday Rush", room: RUSH.room, dishes: RUSH.dishes, types: RUSH.types,
          count: Infinity, first: RUSH.first, gap: RUSH.gap, patience: RUSH.patienceStart,
          target: Infinity, maxLost: RUSH.mistakes - 1 }
      : SHIFTS[this.shiftIdx];
    this.room = ROOMS[this.shift.room];

    this.t = 0;
    this.tables = this.room.spots.map((spot, i) => ({
      i, spot, x: SPOTS[spot].x, y: SPOTS[spot].y,
      cloth: this.room.cloths[i],
      state: "free", party: null, wants: [], has: [], eatT: 0, clears: 0,
    }));
    this.queue = [];
    this.plan = this.mode === "rush" ? [] : this.dealParties();
    this.arrived = 0;
    this.nextAt = this.shift.first;
    this.nextId = 1;
    this.nextPlate = 1;

    this.pass = [];
    this.stations = {};
    for (const s of STATIONS) this.stations[s.id] = { busy: false, t: 0, dur: 0, makes: null, held: null };

    this.server = { x: SERVER_HOME.x, y: SERVER_HOME.y, carrying: [], tasks: [] };
    this.selected = null;

    this.score = 0; this.coins = 0; this.served = 0; this.lost = 0; this.wasted = 0;
    this.chainKind = null; this.chainCount = 0; this.bestChain = 0;
    this.inspectorLost = false;
    this.result = null;
    this.running = true;
    this.emit("open", { shift: this.shift });
  },

  // Every party dealt up front, so a replay of the same seed is the same day and
  // a shift's difficulty is a property of the schedule rather than of the roll.
  dealParties() {
    const out = [];
    for (let k = 0; k < this.shift.count; k++) out.push(this.rollParty());
    return out;
  },

  rollParty() {
    const types = this.shift.types;
    const type = types[Math.floor(this.rand() * types.length)];
    const g = GUEST[type];
    const dishes = this.shift.dishes;
    const order = [];
    for (let k = 0; k < g.dishes; k++) order.push(dishes[Math.floor(this.rand() * dishes.length)]);
    const cloths = this.room.cloths;
    return {
      id: 0, type, order,
      size: g.seats,
      cloth: cloths[Math.floor(this.rand() * cloths.length)],
    };
  },

  /* ---------------- reading the room ---------------- */

  patienceFor(g) {
    const base = this.mode === "rush"
      ? RUSH.patienceStart * Math.pow(RUSH.patienceDecay, this.resolved())
      : this.shift.patience + this.kit.patience;
    return base * g.patience;
  },

  resolved() { return this.served + this.lost; },
  left() { return this.mode === "rush" ? Infinity : this.shift.count - this.resolved(); },
  table(i) { return this.tables.find((t) => t.i === i); },
  freeTables() { return this.tables.filter((t) => t.state === "free"); },
  hearts(p) { return Math.max(0, Math.ceil((p.patience / p.patienceMax) * 3)); },

  // Occupied tables close enough to bother each other. Used only by Prickle, but
  // derived from the geometry so moving a table can't leave a stale rule behind.
  neighboursOf(t) {
    return this.tables.filter((o) => o !== t && o.party && neighbours(t.spot, o.spot));
  },

  stationBusy(id) { const s = this.stations[id]; return s.busy || !!s.held; },
  passFull() { return this.pass.length >= PASS.slots; },

  // Two different questions, and conflating them cost a whole debugging pass.
  //
  //   outstanding()  what the floor is waiting to be BROUGHT — table wants less
  //                  what is already in her hands. Drives fetching.
  //   demand()       what still needs COOKING — the above, less what is already
  //                  sitting at the pass. Drives the kitchen.
  //
  // Fetch on `demand` and she never picks anything up, because a plate at the
  // pass cancels the very want it was made for.
  outstanding() {
    const need = {};
    for (const t of this.tables) {
      if (t.state !== "ordered") continue;
      for (const d of t.wants) need[d] = (need[d] || 0) + 1;
    }
    for (const d of this.server.carrying) if (need[d]) need[d]--;
    return need;
  },

  demand() {
    const need = this.outstanding();
    for (const p of this.pass) if (need[p.dish]) need[p.dish]--;
    return need;
  },

  /* ---------------- the taps ---------------- */

  // The guest you had picked out can always be gone by the time you tap — seated
  // by a job you queued a moment ago, or simply walked off. A selection that
  // outlives its party made every later tap read as a seating attempt and the
  // whole floor locked up, so nothing may assume it is still valid.
  validateSelection() {
    if (this.selected && !this.queue.includes(this.selected)) {
      this.selected = null;
      this.emit("select", { party: null });
    }
  },

  // Pick up a party at the door. Tapping the same one again puts them down, and
  // tapping one who has already gone just clears the selection.
  tapQueue(id) {
    if (!this.running) return this.no("over");
    this.validateSelection();
    const p = this.queue.find((q) => q.id === id);
    if (!p) { this.selected = null; this.emit("select", { party: null }); return this.no("noParty"); }
    this.selected = this.selected === p ? null : p;
    this.emit("select", { party: this.selected });
    return this.yes();
  },

  // One tap on a table means whatever that table is currently asking for.
  tapTable(i) {
    if (!this.running) return this.no("over");
    this.validateSelection();
    const t = this.table(i);
    if (!t) return this.no("noTable");

    if (this.selected) {
      if (t.state !== "free") return this.no("taken");
      if (this.selected.size > 3) return this.no("tooBig");
      return this.push("seat", t, { party: this.selected });
    }

    // One tap seats the front of the queue. Requiring a guest to be picked out
    // FIRST made the obvious action — tap the empty table — do nothing at all:
    // 24 of 40 taps in a busy shift were rejected as "nothing to do", silently.
    // Choosing WHO still works by tapping them first, which is what you do when
    // you are hunting a colour match.
    if (t.state === "free") {
      if (!this.queue.length) return this.no("nobodyWaiting");
      const p = this.queue[0];
      if (p.size > 3) return this.no("tooBig");
      return this.push("seat", t, { party: p });
    }

    if (t.state === "seated") return this.push("order", t);

    if (t.state === "ordered") {
      if (this.server.carrying.some((d) => t.wants.includes(d))) return this.push("serve", t);
      // Empty-handed but their food is sitting at the pass: go and get it, then
      // bring it. Two taps for one obvious intention is one tap too many, and
      // it still costs both walks.
      const ready = this.pass.some((pl) => t.wants.includes(pl.dish));
      if (ready && this.server.carrying.length < this.kit.carry
          && this.server.tasks.length + 2 <= TASK_QUEUE
          && !this.server.tasks.some((k) => k.kind === "collect")) {
        const got = this.tapPass();
        if (got.ok) return this.push("serve", t);
      }
      return this.no(this.server.carrying.length ? "wrongDish" : "notReady");
    }
    // Settling up and clearing are one trip. Two separate walks per party was
    // what made the whole campaign unservable.
    if (t.state === "bill" || t.state === "dirty") return this.push("clear", t);
    if (t.state === "eating") return this.no("eating");
    return this.no("nothingToDo");
  },

  // One tap on the pass loads the whole tray — everything the floor is waiting
  // for, up to what she can carry. Collecting one plate per trip made the walk
  // to the counter cost the same as a walk to a table, which is nonsense: they
  // are all in arm's reach of each other.
  tapPass() {
    if (!this.running) return this.no("over");
    if (!this.pass.length) return this.no("noPlate");
    if (this.server.tasks.some((k) => k.kind === "collect")) return this.no("alreadyOn");
    if (this.server.carrying.length >= this.kit.carry) return this.no("handsFull");
    return this.push("collect", null, { x: this.passX(0) + PASS.step, y: PASS.standY });
  },

  // Starting a station costs no walk — you call it through the hatch. The cost is
  // that it takes time and can only make one thing at a time, so the decision is
  // WHEN and WHAT, never whether you can be bothered to go there.
  tapStation(id, dish) {
    if (!this.running) return this.no("over");
    const st = this.stations[id];
    if (!st) return this.no("noStation");
    if (st.busy) return this.no("stationBusy");
    if (st.held) return this.no("stationFull");

    const makes = STATION[id].makes;
    const options = (Array.isArray(makes) ? makes : [makes]).filter((d) => this.shift.dishes.includes(d));
    if (!options.length) return this.no("notToday");
    let pick = dish && options.includes(dish) ? dish : null;
    if (!pick) {
      // No dish named: make whatever the floor is actually short of.
      const need = this.demand();
      options.sort((a, b) => (need[b] || 0) - (need[a] || 0));
      pick = options[0];
    }
    st.busy = true; st.t = 0; st.dur = STATION[id].base * this.kit.cook; st.makes = pick;
    this.emit("cookStart", { station: id, dish: pick });
    return this.yes({ dish: pick });
  },

  // Put the whole tray down. The escape hatch that makes a jam impossible.
  tapBin() {
    if (!this.running) return this.no("over");
    if (!this.server.carrying.length) return this.no("emptyHanded");
    const n = this.server.carrying.length;
    this.server.carrying = [];
    this.wasted += n;
    this.emit("binned", { n });
    return this.yes();
  },

  passX(slot) { return PASS.x0 + slot * PASS.step; },

  /* ---------------- the task queue ---------------- */

  // Tapping lines a job up; the server walks and does them in order. Two queued
  // behind the current one is enough to plan a trip without letting anyone
  // queue the whole shift and stop playing.
  push(kind, table, extra = {}) {
    if (this.server.tasks.length >= TASK_QUEUE) return this.no("busy");
    // One job per table at a time. A table stays `seated` until the order is
    // actually taken, so without this a second tap queues a second identical
    // trip — and the bots showed 52 of 76 queued jobs arriving to find there was
    // nothing left to do, each having paid for the walk. Tapping again is now a
    // no-op rather than a punishment.
    if (table && this.server.tasks.some((k) => k.tableId === table.i)) return this.no("alreadyOn");
    const legs = [];
    if (kind === "seat") {
      const g = GUEST[extra.party.type];
      // No walk: you catch their eye and point at the table. The tiny one is the
      // exception that proves it — she genuinely has to be walked over, which is
      // the entire content of her mechanic.
      if (g.escort) {
        legs.push({ x: QUEUE_SLOTS[0].x + 26, y: this.queueY(extra.party), dur: JOB.seat });
        legs.push({ x: table.x, y: table.y + 34, dur: JOB.seat * 0.7 });
      } else {
        // `here` means exactly that: do it wherever you are standing when you get
        // to it. Pinning the leg to server.x/y at TAP time looked equivalent and
        // is not — with two jobs queued ahead she had already moved on, so every
        // seating dragged her back across the room to the spot where the tap
        // happened. It cost more walking than the job it replaced.
        legs.push({ here: true, dur: JOB.seat });
      }
      this.selected = null;
    } else if (kind === "collect") {
      legs.push({ x: extra.x, y: extra.y, dur: JOB.collect });
    } else {
      const dur = kind === "order" ? JOB.order * (GUEST[table.party.type].slowOrder || 1)
        : kind === "serve" ? JOB.serve
        : JOB.clear * this.kit.clear;
      legs.push({ x: table.x, y: table.y + 34, dur });
    }
    const task = { kind, tableId: table ? table.i : null, legs, leg: 0, t: 0, ...extra };
    this.server.tasks.push(task);
    this.emit("queued", { task, depth: this.server.tasks.length });
    return this.yes();
  },

  queueY(party) {
    const k = this.queue.indexOf(party);
    return (QUEUE_SLOTS[Math.max(0, Math.min(QUEUE_SLOTS.length - 1, k))] || QUEUE_SLOTS[0]).y;
  },

  /* ---------------- time ---------------- */

  tick(dt) {
    if (!this.running) return;
    this.t += dt;
    this.tickStations(dt);
    this.tickPass(dt);
    this.tickServer(dt);
    this.tickTables(dt);
    this.tickPatience(dt);
    this.admit();
    this.checkEnd();
  },

  tickStations(dt) {
    for (const s of STATIONS) {
      const st = this.stations[s.id];
      // A finished dish waits at the station until the pass has room for it. A
      // jammed pass therefore stops the kitchen, which is the point.
      if (st.held) {
        if (!this.passFull()) { this.landPlate(st.held); st.held = null; }
        continue;
      }
      if (!st.busy) continue;
      st.t += dt;
      if (st.t < st.dur) continue;
      st.busy = false;
      if (this.passFull()) st.held = st.makes;
      else this.landPlate(st.makes);
      this.emit("cookDone", { station: s.id, dish: st.makes, held: !!st.held });
    }
  },

  landPlate(dish) {
    this.pass.push({ id: this.nextPlate++, dish, age: 0 });
    this.emit("plate", { dish });
  },

  tickPass(dt) {
    for (let i = this.pass.length - 1; i >= 0; i--) {
      const p = this.pass[i];
      p.age += dt;
      if (p.age < PLATE_LIFE) continue;
      this.pass.splice(i, 1);
      this.wasted++;
      this.emit("cold", { dish: p.dish });
    }
  },

  tickServer(dt) {
    const s = this.server;
    const task = s.tasks[0];
    if (!task) return;
    const leg = task.legs[task.leg];

    // Walk first. Only when she's standing on the spot does the job start.
    if (!leg.here) {
      const dx = leg.x - s.x, dy = leg.y - s.y;
      const d = Math.hypot(dx, dy);
      if (d > 1.5) {
        const step = Math.min(d, this.kit.walk * dt);
        s.x += (dx / d) * step; s.y += (dy / d) * step;
        return;
      }
      s.x = leg.x; s.y = leg.y;
    }
    task.t += dt;
    if (task.t < leg.dur) return;

    task.t = 0;
    task.leg++;
    if (task.leg < task.legs.length) return;

    s.tasks.shift();
    this.finish(task);
  },

  tickTables(dt) {
    for (const t of this.tables) {
      if (t.state !== "eating") continue;
      t.eatT -= dt;
      if (t.eatT > 0) continue;
      t.state = "bill";
      this.emit("wantsToPay", { table: t });
    }
  },

  tickPatience(dt) {
    // At the door.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const p = this.queue[i];
      p.patience -= dt * DRAIN.door * GUEST[p.type].drain;
      if (p.patience > 0) continue;
      this.queue.splice(i, 1);
      if (this.selected === p) this.selected = null;
      this.giveUp(p, "door");
    }
    // At a table.
    for (const t of this.tables) {
      const p = t.party;
      if (!p) continue;
      let rate = DRAIN[t.state] != null ? DRAIN[t.state] : 1;
      if (rate === 0) continue;
      // Prickle makes his neighbours miserable.
      if (this.neighboursOf(t).some((o) => GUEST[o.party.type].prickly)) rate *= 2;
      p.patience -= dt * rate * GUEST[p.type].drain;
      if (p.patience > 0) continue;
      const wasted = t.has.length;
      t.party = null; t.state = "dirty"; t.clears = 1; t.wants = []; t.has = [];
      this.server.tasks = this.server.tasks.filter((k) => k.tableId !== t.i);
      this.wasted += wasted;
      this.giveUp(p, "table");
    }
  },

  giveUp(p, where) {
    this.lost++;
    if (GUEST[p.type].mustPlease) this.inspectorLost = true;
    this.breakChain();
    this.emit("gaveUp", { party: p, where, lost: this.lost });
    this.checkEnd();
  },

  // Arrivals are held while the door is full, so falling behind makes the shift
  // LONGER rather than hopeless. Without it, one bad minute is unrecoverable.
  admit() {
    while (this.queue.length < this.kit.queue
           && this.t >= this.nextAt
           && (this.mode === "rush" || this.arrived < this.plan.length)) {
      const base = this.mode === "rush" ? this.rollParty() : this.plan[this.arrived];
      const g = GUEST[base.type];
      const pat = this.patienceFor(g);
      const p = { ...base, id: this.nextId++, patience: pat, patienceMax: pat, at: this.t };
      this.arrived++;
      this.queue.push(p);
      this.nextAt = this.t + this.shift.gap;
      this.emit("arrive", { party: p });
    }
  },

  /* ---------------- finishing a job ---------------- */

  finish(task) {
    const t = task.tableId != null ? this.table(task.tableId) : null;

    if (task.kind === "seat") {
      const p = task.party;
      const k = this.queue.indexOf(p);
      if (k < 0 || !t || t.state !== "free") return;   // they left, or you were beaten to it
      this.queue.splice(k, 1);
      t.party = p; t.state = "seated"; t.wants = []; t.has = [];
      t.clears = GUEST[p.type].messy ? 2 : 1;
      const match = p.cloth === t.cloth;
      this.award("seat", SCORE.SEAT + (match ? SCORE.MATCH : 0));
      this.emit("seated", { table: t, party: p, match });
      return;
    }

    if (task.kind === "order") {
      if (!t || t.state !== "seated") return;
      t.state = "ordered";
      t.wants = t.party.order.slice();
      this.award("order", SCORE.SEAT);
      this.emit("ordered", { table: t, wants: t.wants.slice() });
      return;
    }

    if (task.kind === "collect") {
      // What somebody is waiting for, first. Grabbing every spare plate
      // "because it fits" filled both hands with food nobody had ordered, and
      // with no free hand she could not fetch what was wanted — a table starved
      // beside a full pass.
      //
      // But she must never walk all the way there and come back EMPTY. Tapping
      // the pass is an instruction, not a suggestion, and "I picked up the tea
      // and she ignored me" is the worst thing a control can do. So if nothing
      // on the pass is spoken for yet — you fetched before taking the order —
      // she still brings ONE plate back. Wanted first, one spare at most.
      const need = this.outstanding();
      const took = [];
      for (let k = this.pass.length - 1; k >= 0; k--) {
        if (this.server.carrying.length >= this.kit.carry) break;
        const p = this.pass[k];
        if (!need[p.dish]) continue;
        need[p.dish]--;
        this.pass.splice(k, 1);
        this.server.carrying.push(p.dish);
        took.push(p.dish);
      }
      if (!took.length && this.pass.length && this.server.carrying.length < this.kit.carry) {
        const p = this.pass.shift();
        this.server.carrying.push(p.dish);
        took.push(p.dish);
      }
      if (!took.length) return;                         // it all went cold on the way
      this.award("collect", 0);
      this.emit("collected", { took, carrying: this.server.carrying.slice() });
      return;
    }

    if (task.kind === "serve") {
      if (!t || t.state !== "ordered") return;
      const g = GUEST[t.party.type];
      const carry = this.server.carrying;
      const need = t.wants.slice();
      const wantedAll = t.party.order.length;

      // Refusing a half-laid table DEADLOCKS the room, and it took three birthday
      // bears at once to show it: hands full of two dishes that are each wanted
      // somewhere, no bear completable, no free hand to fetch what would complete
      // one. A real player would have to discover the bin to escape, which is a
      // rotten way to learn anything.
      //
      // So bringing an order in one trip is a BONUS rather than a requirement.
      // The batching still matters — it is worth real points and the bear is the
      // guest who makes it worth most — but forgetting it costs you points
      // instead of costing you the shift.
      let handed = 0;
      for (let k = need.length - 1; k >= 0; k--) {
        const j = carry.indexOf(need[k]);
        if (j < 0) continue;
        carry.splice(j, 1);
        t.has.push(t.wants.splice(k, 1)[0]);
        handed++;
      }
      if (!handed) { this.emit("refused", { table: t, why: "wrongDish" }); return; }

      const oneTrip = handed === wantedAll && wantedAll > 1;
      this.award("serve", SCORE.SERVE * handed + (oneTrip ? SCORE.ONE_TRIP * (g.allAtOnce ? 2 : 1) : 0));
      if (!t.wants.length) {
        t.state = "eating";
        t.eatT = JOB.eat * (g.linger || 1);
        this.emit("eating", { table: t, oneTrip });
      }
      this.emit("servedDish", { table: t, handed, oneTrip });
      return;
    }

    // Clearing is also settling up: if they are still sitting there, they pay on
    // the way out and the table becomes yours again.
    if (task.kind === "clear") {
      if (!t) return;
      if (t.state === "bill") {
        const p = t.party;
        const frac = GK.util.clamp(p.patience / p.patienceMax, 0, 1);
        const pay = payout(p, frac);
        this.coins += pay.coins;
        this.served++;
        this.award("clear", SCORE.PAY_BASE + (frac > 0.5 ? SCORE.PERFECT : 0));
        t.party = null; t.has = []; t.clears--;
        t.state = t.clears > 0 ? "dirty" : "free";
        this.emit("paid", { table: t, party: p, coins: pay.coins, tip: pay.tip, frac, happy: frac > 0.5,
                            stillDirty: t.state === "dirty" });
        this.checkEnd();
        return;
      }
      if (t.state !== "dirty") return;
      t.clears--;
      if (t.clears > 0) { this.emit("stillDirty", { table: t }); return; }
      t.state = "free";
      this.award("clear", SCORE.SEAT);
      this.emit("cleared", { table: t });
    }
  },

  /* ---------------- chaining ---------------- */

  // Two of the same job in a row pays more. It is the only reason the quickest
  // route and the best-scoring route are ever different, which is the only
  // reason there is a decision here at all.
  award(kind, base) {
    // Fetching does not touch the chain — it neither extends nor breaks it.
    // Going to the pass is PART of serving, and counting it as a different job
    // meant serve-collect-serve scored as three separate ones. Best chains sat
    // at 2.2 however hard a player hunted them, which made the multiplier
    // decoration. Now two tables served off one tray is a real chain of two.
    if (kind === "collect") return 0;
    if (kind === this.chainKind) this.chainCount++;
    else { this.chainKind = kind; this.chainCount = 1; }
    if (this.chainCount > this.bestChain) this.bestChain = this.chainCount;
    const mult = Math.min(SCORE.CHAIN_MAX, 1 + SCORE.CHAIN_STEP * (this.chainCount - 1));
    const points = Math.round(base * mult);
    this.score += points;
    if (points) this.emit("score", { kind, points, mult, chain: this.chainCount });
    return points;
  },

  breakChain() { this.chainKind = null; this.chainCount = 0; },

  chainMult() {
    return Math.min(SCORE.CHAIN_MAX, 1 + SCORE.CHAIN_STEP * Math.max(0, this.chainCount - 1));
  },

  /* ---------------- the end ---------------- */

  // Losing is checked before winning: both can go true in the same tick, and the
  // wrong order ships a "well done" for a shift that just collapsed.
  checkEnd() {
    if (!this.running) return;
    if (this.mode === "rush") { if (this.lost >= RUSH.mistakes) this.end(false); return; }
    if (this.inspectorLost) return this.end(false);
    if (this.lost > this.shift.maxLost) return this.end(false);
    if (this.resolved() >= this.shift.count) this.end(true);
  },

  stars() {
    if (this.mode !== "shift") return 0;
    const tgt = this.shift.target;
    let n = 0;
    for (let k = 0; k < 3; k++) if (this.score >= Math.round(tgt * STAR_MULT[k])) n = k + 1;
    return n;
  },

  end(finished) {
    if (!this.running) return this.result;
    this.running = false;

    const ok = this.mode === "shift" && finished
      && !this.inspectorLost && this.lost <= this.shift.maxLost;
    const stars = ok ? Math.max(1, this.stars()) : 0;
    if (ok) this.coins += stars * 12 + 25;

    // Who you actually fed, for the album.
    const met = {};
    for (const p of this.plan.slice(0, this.arrived)) met[p.type] = (met[p.type] || 0) + 1;

    this.result = {
      mode: this.mode, win: ok, stars,
      score: this.score, coins: this.coins,
      served: this.served, lost: this.lost, wasted: this.wasted,
      bestChain: this.bestChain, seconds: this.t,
      inspectorLost: this.inspectorLost,
      target: this.shift.target, met,
      shiftIdx: this.shiftIdx,
    };
    this.emit("shiftEnd", this.result);
    return this.result;
  },

  abandon() { this.running = false; this.result = null; },
};

if (typeof module !== "undefined") module.exports = {};

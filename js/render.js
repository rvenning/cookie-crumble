// Cookie Crumble — the kitchen on a canvas, and all the input.
//
// The shop is drawn as five stacked bands and the production line runs UPWARD
// through them: bench at the bottom where your thumb is, then the oven, then the
// icing table, and the customers along the top. A tray physically climbs the
// screen as it becomes a cookie, which is most of the tutorial.
//
// Everything is a TAP. No drags at all — a drag is fiddlier than a tap for a
// small hand and there is nothing here a drag would express better. But taps
// commit on LIFT, not on press: pointerdown lights a zone, sliding moves which
// zone is lit, and only pointerup acts. A mis-aimed thumb costs a slide instead
// of a burnt tray.
//
// Bright crayon: flat fills, every edge stroked in the same near-black ink, no
// gradients and no shadows.

const INK = "#2a211b";
const PAPER = "#fffaf0";
const WALL = "#ffe9c4";
const WOOD = "#c98f4e";
const WOOD_DK = "#a5713a";
const OVEN_BODY = "#544840";
const OVEN_GLOW = "#ff9b3d";
const GREEN = "#5ec26a";
const AMBER = "#ffb02e";
const RED = "#e0503f";
const PINK = "#ff8fbf";

// Bake phase -> the biscuit's own colour, before any icing goes on.
const BAKE_COLOUR = {
  raw: "#f3e2c2",
  perfect: null,          // the shape's own colour
  crisp: "#a9702f",
  burnt: "#4a3628",
};

const Render = {
  cv: null, ctx: null, stage: null,
  W: 0, H: 0, scale: 1, safeB: 0,
  bands: null,
  zones: [],

  down: null,             // the zone the finger went down on
  hover: null,            // the zone it is currently over
  flash: {},              // zone key -> seconds of highlight left
  shakeZone: null, shakeT: 0,
  clock: 0,
  fretT: 0,

  boot() {
    this.cv = document.getElementById("cv");
    this.ctx = this.cv.getContext("2d");
    this.stage = document.getElementById("stage");

    const remeasure = () => { this.resize(); setTimeout(() => this.resize(), 350); };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", remeasure);
      window.visualViewport.addEventListener("scroll", () => this.resize());
    }
    // iOS ignores user-scalable=no for pinch, and only closing the tab clears a
    // zoom once it has stuck. Block it at the source.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());
    remeasure();

    const pos = (e) => {
      const r = this.cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const p = pos(e);
      // Set the gesture state BEFORE capturing: setPointerCapture throws
      // NotFoundError whenever the browser does not consider that pointer
      // active, and `?.` does not protect you — the throw would take the rest
      // of this handler with it and leave a half-built gesture.
      this.down = this.hover = this.hitZone(p.x, p.y);
      try { this.cv.setPointerCapture?.(e.pointerId); } catch {}
    }, { passive: false });

    this.cv.addEventListener("pointermove", (e) => {
      if (!this.down) return;
      // Never gate on e.pressure: it is ZERO for ordinary touch on iOS, so the
      // obvious `if (e.pressure > 0)` guard silently drops every move of a real
      // finger while working perfectly with a desktop mouse.
      e.preventDefault();
      const p = pos(e);
      this.hover = this.hitZone(p.x, p.y);
    }, { passive: false });

    this.cv.addEventListener("touchmove", (e) => {
      if (!this.down || !e.touches[0]) return;
      e.preventDefault();
      const r = this.cv.getBoundingClientRect();
      this.hover = this.hitZone(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
    }, { passive: false });

    this.cv.addEventListener("pointerup", (e) => {
      const p = pos(e);
      const z = this.hitZone(p.x, p.y);
      const started = this.down;
      this.down = this.hover = null;
      if (z && started && z.key === started.key) App.tap(z.kind, z.arg, z.key);
    });

    this.cv.addEventListener("pointercancel", () => { this.down = this.hover = null; });
  },

  /* ---------------- layout ---------------- */

  resize() {
    if (!this.stage) return;
    const box = this.stage.getBoundingClientRect();
    // The game screen is display:none until it is shown and a resize then reads
    // 0x0 — keep the last good layout rather than dividing by nothing.
    if (box.width < 50 || box.height < 50) return;

    this.W = box.width; this.H = box.height;
    const dpr = window.devicePixelRatio || 1;
    // BACKING STORE ONLY. The canvas takes its display size from
    // `width:100%; height:100%` in the stylesheet — pinning an inline pixel
    // size here looks equivalent and goes stale the instant anything reflows
    // the stage.
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.scale = GK.util.clamp(this.W / 380, 0.7, 1.5);
    this.safeB = parseFloat(getComputedStyle(this.stage).getPropertyValue("--safe-b")) || 0;

    const h = this.H - this.safeB;
    const cut = (a, b) => ({ y: h * a, h: h * (b - a) });
    this.bands = {
      counter: cut(0, 0.27),
      table: cut(0.27, 0.46),
      oven: cut(0.46, 0.67),
      bench: cut(0.67, 0.86),
      shelf: cut(0.86, 1.0),
    };
    this.layoutZones();
  },

  // Rebuilt every frame's worth of state change rather than cached: the cutter
  // palette only exists while there is dough on the bench, and the oven grows a
  // shelf the moment one is bought.
  layoutZones() {
    this.zones = [];
    if (!this.bands || !Game.shift) return;
    const b = this.bands, S = this.scale, pad = 8 * S;
    const add = (kind, arg, x, y, w, h, key) =>
      this.zones.push({ kind, arg, x, y, w, h, key: key || `${kind}:${arg == null ? "" : arg}` });

    // --- customers, along the top ---
    const n = Game.shift.maxWaiting;
    const cw = Math.min(126 * S, (this.W - pad * 2 - pad * (n - 1)) / n);
    const cx0 = (this.W - (cw * n + pad * (n - 1))) / 2;
    for (let i = 0; i < n; i++) {
      const c = Game.counter[i];
      if (!c) continue;
      add("customer", c.id, cx0 + i * (cw + pad), b.counter.y + 6 * S, cw, b.counter.h - 14 * S);
    }

    // --- the icing table: the tray on the left, the colours on the right ---
    this.grid(b.table, "icing", () => {
      if (!Game.table) return [];
      const cols = Game.icings().filter((i) => i !== "none");
      const cells = cols.map((id) => ({ kind: "icing", arg: id }));
      if (Game.sprinklesOn()) cells.push({ kind: "sprinkles", arg: null });
      return cells;
    }, add);
    add("table", null, pad, b.table.y + 6 * S, this.W * 0.28 - pad, b.table.h - 12 * S);

    // --- the oven, one slot per shelf ---
    const on = Game.ovens.length;
    const ow = Math.min(150 * S, (this.W - pad * 2 - pad * (on - 1)) / on);
    const ox0 = (this.W - (ow * on + pad * (on - 1))) / 2;
    for (let i = 0; i < on; i++)
      add("oven", i, ox0 + i * (ow + pad), b.oven.y + 5 * S, ow, b.oven.h - 10 * S);

    // --- the bench: the bowl on the left, the cutters on the right ---
    this.grid(b.bench, "cutter", () => (
      Game.bench.state === "dough"
        ? Game.shapes().map((id) => ({ kind: "cutter", arg: id }))
        : []
    ), add);
    add("bench", null, pad, b.bench.y + 6 * S, this.W * 0.28 - pad, b.bench.h - 12 * S);

    // --- the shelf: cooling rack, your hands, the bin ---
    const rn = Game.rack.length;
    const slots = rn + 2;                       // + hands + bin
    const sw = (this.W - pad * 2 - 6 * S * (slots - 1)) / slots;
    let sx = pad;
    for (let i = 0; i < rn; i++) {
      add("rack", i, sx, b.shelf.y + 3 * S, sw, b.shelf.h - 8 * S);
      sx += sw + 6 * S;
    }
    add("hands", null, sx, b.shelf.y + 3 * S, sw, b.shelf.h - 8 * S); sx += sw + 6 * S;
    add("bin", null, sx, b.shelf.y + 3 * S, sw, b.shelf.h - 8 * S);
  },

  // A 3-across palette filling the right ~72% of a band. Three columns keeps
  // every button over 44px on a 320px phone; six across would not.
  grid(band, _kind, cellsFn, add) {
    const cells = cellsFn();
    if (!cells.length) return;
    const S = this.scale, pad = 8 * S;
    const x0 = this.W * 0.28 + pad * 0.5;
    const w = this.W - x0 - pad;
    const cols = 3;
    const rows = Math.ceil(cells.length / cols);
    const gx = 5 * S, gy = 5 * S;
    const cw = (w - gx * (cols - 1)) / cols;
    const ch = (band.h - 12 * S - gy * (rows - 1)) / rows;
    cells.forEach((c, i) => {
      const r = Math.floor(i / cols), k = i % cols;
      add(c.kind, c.arg, x0 + k * (cw + gx), band.y + 6 * S + r * (ch + gy), cw, ch);
    });
  },

  hitZone(x, y) {
    // Last first: palettes are added after the station they sit beside, and the
    // one on top should win.
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  },

  /* ---------------- engine events ---------------- */

  hit(key, amount = 0.35) { this.flash[key] = amount; },

  shake(key) { this.shakeZone = key; this.shakeT = 0.32; },

  /* ---------------- frame ---------------- */

  update(dt) {
    this.clock += dt;
    for (const k of Object.keys(this.flash)) {
      this.flash[k] -= dt;
      if (this.flash[k] <= 0) delete this.flash[k];
    }
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);

    // A stage can resize with no resize event at all — the web font landing, a
    // HUD row appearing, a banner rewrapping. Notice the drift here rather than
    // hunting every cause.
    if (this.stage) {
      const b = this.stage.getBoundingClientRect();
      if (b.width > 50 && b.height > 50 &&
          (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();
    }

    if (Game.running) {
      this.layoutZones();
      // A ticking sound for anybody about to give up, at most twice a second.
      this.fretT -= dt;
      if (this.fretT <= 0) {
        const worried = Game.counter.some((c) => c.patience / c.patienceMax < 0.25);
        if (worried) { GK.Sfx.fret(); this.fretT = 0.5; } else this.fretT = 0.2;
      }
    }
  },

  render() {
    const ctx = this.ctx;
    if (!ctx || !this.W || !this.bands) return;
    ctx.clearRect(0, 0, this.W, this.H);

    // The shop itself, painted past the bands so nothing floats in a void.
    ctx.fillStyle = WALL;
    ctx.fillRect(0, 0, this.W, this.H);
    this.tiles();

    if (!Game.shift) return;
    this.drawCounter();
    this.drawTable();
    this.drawOven();
    this.drawBench();
    this.drawShelf();

    // Whatever the finger is resting on, lit but not yet committed.
    const lit = this.hover && this.down && this.hover.key === this.down.key ? this.hover : null;
    if (lit) {
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 4 * this.scale;
      this.roundRect(lit.x - 2, lit.y - 2, lit.w + 4, lit.h + 4, 12 * this.scale);
      ctx.stroke();
      ctx.restore();
    }
  },

  // A tiled wall behind everything, so the empty band above a short counter
  // reads as a bakery rather than as a gap.
  tiles() {
    const ctx = this.ctx, s = 26 * this.scale;
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += s) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.H); ctx.stroke(); }
    for (let y = 0; y < this.H; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.W, y); ctx.stroke(); }
    ctx.restore();
  },

  /* ---------------- the bands ---------------- */

  drawCounter() {
    const ctx = this.ctx, b = this.bands.counter, S = this.scale;
    // The shop counter the customers stand behind.
    ctx.fillStyle = WOOD_DK;
    ctx.fillRect(0, b.y + b.h - 8 * S, this.W, 8 * S);
    ctx.fillStyle = INK;
    ctx.fillRect(0, b.y + b.h - 10 * S, this.W, 2.5 * S);

    if (!Game.counter.length) {
      this.label(this.W / 2, b.y + b.h / 2, "the shop is quiet…", 13 * S, "rgba(42,33,27,.45)");
      return;
    }

    for (const z of this.zones) {
      if (z.kind !== "customer") continue;
      const c = Game.counter.find((x) => x.id === z.arg);
      if (!c) continue;
      this.drawOrderCard(z, c);
    }
  },

  drawOrderCard(z, c) {
    const ctx = this.ctx, S = this.scale;
    const frac = GK.util.clamp(c.patience / c.patienceMax, 0, 1);
    const worried = frac < 0.25;
    const nudge = worried ? Math.sin(this.clock * 14) * 1.6 * S : 0;

    ctx.save();
    ctx.translate(nudge, 0);
    this.panel(z.x, z.y, z.w, z.h, PAPER, this.flash[z.key] ? 0.5 : 0);

    // A face, so who is waiting is a person rather than a slot.
    const faces = ["🧑", "👵", "🧒", "👨", "👩", "🧓", "👧", "👦"];
    ctx.font = `${Math.round(22 * S)}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(faces[c.id % faces.length], z.x + z.w / 2, z.y + 20 * S);

    // The cookie they asked for, drawn exactly as a finished tray would be.
    const r = Math.min(z.w * 0.24, (z.h - 58 * S) * 0.5);
    this.drawCookie(z.x + z.w / 2, z.y + 40 * S + r, r,
      c.order.shape, c.order.icing, c.order.sprinkles, "perfect");

    // ...and named underneath, because reading is content here, never a gate:
    // the picture alone is always enough to fill the order.
    const ic = ICING[c.order.icing];
    const words = (c.order.icing === "none" ? "plain" : ic.name.toLowerCase())
      + " " + SHAPE[c.order.shape].name.toLowerCase() + (c.order.sprinkles ? " ✨" : "");
    this.label(z.x + z.w / 2, z.y + z.h - 20 * S, words, 10.5 * S, INK);

    // How long they will stand there.
    const bw = z.w - 16 * S, bx = z.x + 8 * S, by = z.y + z.h - 11 * S;
    ctx.fillStyle = "rgba(42,33,27,.16)";
    this.roundRect(bx, by, bw, 6 * S, 3 * S); ctx.fill();
    ctx.fillStyle = frac > 0.5 ? GREEN : frac > 0.25 ? AMBER : RED;
    this.roundRect(bx, by, Math.max(2, bw * frac), 6 * S, 3 * S); ctx.fill();
    ctx.restore();
  },

  drawTable() {
    const ctx = this.ctx, b = this.bands.table, S = this.scale;
    const z = this.zones.find((x) => x.kind === "table");
    if (!z) return;

    this.panel(z.x, z.y, z.w, z.h, PAPER, this.flash["table:"] ? 0.5 : 0);
    this.label(z.x + z.w / 2, z.y + 12 * S, "ICING", 10 * S, "rgba(42,33,27,.5)");

    if (Game.table) {
      const t = Game.table.tray;
      const r = Math.min(z.w * 0.3, z.h * 0.26);
      this.drawTray(z.x + z.w / 2, z.y + z.h * 0.58, r, t);
      if (Game.table.icingT > 0) this.label(z.x + z.w / 2, z.y + z.h - 10 * S, "…", 14 * S, INK);
    } else {
      ctx.font = `${Math.round(26 * S)}px system-ui`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.4;
      ctx.fillText("🎨", z.x + z.w / 2, z.y + z.h * 0.58);
      ctx.globalAlpha = 1;
    }

    for (const p of this.zones) {
      if (p.kind === "icing") {
        const ic = ICING[p.arg];
        const on = Game.table && Game.table.tray.icing === p.arg;
        this.panel(p.x, p.y, p.w, p.h, ic.swatch, this.flash[p.key] ? 0.6 : 0, on ? 4.5 : 3);
        this.label(p.x + p.w / 2, p.y + p.h / 2, ic.name, 11 * S, INK);
      } else if (p.kind === "sprinkles") {
        const on = Game.table && Game.table.tray.sprinkles;
        this.panel(p.x, p.y, p.w, p.h, on ? "#ffe9a8" : PAPER, this.flash[p.key] ? 0.6 : 0, on ? 4.5 : 3);
        this.label(p.x + p.w / 2, p.y + p.h / 2, "✨ sprinkles", 10.5 * S, INK);
      }
    }
  },

  drawOven() {
    const ctx = this.ctx, b = this.bands.oven, S = this.scale;
    for (const z of this.zones) {
      if (z.kind !== "oven") continue;
      const o = Game.ovens[z.arg];
      const baking = !!o.tray;

      this.panel(z.x, z.y, z.w, z.h, OVEN_BODY, this.flash[z.key] ? 0.45 : 0);

      // The door: a warm window when something is in it.
      const dx = z.x + 7 * S, dy = z.y + 7 * S, dw = z.w - 14 * S, dh = z.h * 0.5;
      ctx.fillStyle = baking ? OVEN_GLOW : "#3a322c";
      this.roundRect(dx, dy, dw, dh, 7 * S); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 3 * S;
      this.roundRect(dx, dy, dw, dh, 7 * S); ctx.stroke();

      if (baking) {
        const r = Math.min(dw * 0.15, dh * 0.34);
        this.drawTray(dx + dw / 2, dy + dh * 0.52, r, o.tray, true);
        this.drawGauge(z, o);
      } else {
        this.label(dx + dw / 2, dy + dh / 2, "empty", 11 * S, "rgba(255,250,240,.6)");
        this.label(z.x + z.w / 2, z.y + z.h - 12 * S, "OVEN", 10 * S, "rgba(255,250,240,.55)");
      }
    }
  },

  // The bake gauge. The green stripe drawn here IS bakeBands() — the same
  // function game.js judges with — so what she is aiming at and what she is
  // graded on cannot drift apart.
  drawGauge(z, o) {
    const ctx = this.ctx, S = this.scale;
    const bands = bakeBands(o.tray.shape, Game.kit.timer);
    const total = bands.crispEnd * 1.06;
    const gx = z.x + 8 * S, gw = z.w - 16 * S;
    const gy = z.y + z.h * 0.62, gh = 13 * S;
    const at = (t) => gx + gw * GK.util.clamp(t / total, 0, 1);

    ctx.fillStyle = "#e9dcc6";
    this.roundRect(gx, gy, gw, gh, 4 * S); ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.fillRect(at(bands.start), gy, at(bands.perfectEnd) - at(bands.start), gh);
    ctx.fillStyle = AMBER;
    ctx.fillRect(at(bands.perfectEnd), gy, at(bands.crispEnd) - at(bands.perfectEnd), gh);
    ctx.fillStyle = "#4a3628";
    ctx.fillRect(at(bands.crispEnd), gy, gx + gw - at(bands.crispEnd), gh);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5 * S;
    this.roundRect(gx, gy, gw, gh, 4 * S); ctx.stroke();

    // The needle.
    const nx = at(o.tray.bakeT);
    ctx.fillStyle = PAPER; ctx.strokeStyle = INK; ctx.lineWidth = 2.5 * S;
    ctx.beginPath();
    ctx.moveTo(nx, gy - 5 * S); ctx.lineTo(nx + 4.5 * S, gy - 12 * S);
    ctx.lineTo(nx - 4.5 * S, gy - 12 * S); ctx.closePath();
    ctx.fill(); ctx.stroke();

    if (o.phase === "perfect") this.label(z.x + z.w / 2, z.y + z.h - 10 * S, "READY!", 12 * S, "#b8ffcb");
    else if (o.phase === "crisp") this.label(z.x + z.w / 2, z.y + z.h - 10 * S, "getting dark…", 11 * S, "#ffd79a");
    else if (o.phase === "burnt") this.label(z.x + z.w / 2, z.y + z.h - 10 * S, "burnt 😞", 11 * S, "#ffb3a8");
  },

  drawBench() {
    const ctx = this.ctx, S = this.scale;
    const z = this.zones.find((x) => x.kind === "bench");
    if (!z) return;

    this.panel(z.x, z.y, z.w, z.h, WOOD, this.flash["bench:"] ? 0.5 : 0);
    const st = Game.bench.state;
    const cx = z.x + z.w / 2, cy = z.y + z.h * 0.52;

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (st === "empty") {
      ctx.font = `${Math.round(28 * S)}px system-ui`;
      ctx.fillText("🥣", cx, cy);
      this.label(cx, z.y + z.h - 11 * S, "tap to mix", 10.5 * S, INK);
    } else if (st === "mixing") {
      const wob = Math.sin(this.clock * 18) * 3 * S;
      ctx.font = `${Math.round(28 * S)}px system-ui`;
      ctx.fillText("🥣", cx + wob, cy);
      this.ring(cx, z.y + z.h - 15 * S, 8 * S, Game.bench.t / Game.kit.mix);
    } else if (st === "dough") {
      ctx.fillStyle = "#f0dcbb"; ctx.strokeStyle = INK; ctx.lineWidth = 3 * S;
      ctx.beginPath(); ctx.ellipse(cx, cy, z.w * 0.3, z.h * 0.19, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      this.label(cx, z.y + z.h - 11 * S, "pick a cutter →", 10 * S, INK);
    } else if (st === "cutting") {
      ctx.font = `${Math.round(24 * S)}px system-ui`;
      ctx.fillText("🍪", cx, cy);
      this.ring(cx, z.y + z.h - 15 * S, 8 * S, Game.bench.t / CUT_TIME);
    } else if (st === "ready") {
      this.drawTray(cx, cy, Math.min(z.w * 0.28, z.h * 0.24), Game.bench.tray);
      this.label(cx, z.y + z.h - 11 * S, "tap to pick up", 9.5 * S, INK);
    }

    for (const p of this.zones) {
      if (p.kind !== "cutter") continue;
      this.panel(p.x, p.y, p.w, p.h, PAPER, this.flash[p.key] ? 0.6 : 0);
      const r = Math.min(p.w * 0.2, p.h * 0.3);
      this.drawCookie(p.x + p.w * 0.28, p.y + p.h / 2, r, p.arg, "none", false, "perfect");
      this.label(p.x + p.w * 0.66, p.y + p.h / 2, SHAPE[p.arg].name, 10.5 * S, INK);
    }
  },

  drawShelf() {
    const ctx = this.ctx, S = this.scale;
    for (const z of this.zones) {
      if (z.kind === "rack") {
        const t = Game.rack[z.arg];
        this.panel(z.x, z.y, z.w, z.h, "#efe3cd", this.flash[z.key] ? 0.5 : 0);
        if (t) this.drawTray(z.x + z.w / 2, z.y + z.h * 0.46, Math.min(z.w * 0.22, z.h * 0.3), t);
        else this.label(z.x + z.w / 2, z.y + z.h / 2, "🧊 rack", 10 * S, "rgba(42,33,27,.55)");
      } else if (z.kind === "hands") {
        const full = !!Game.hands;
        this.panel(z.x, z.y, z.w, z.h, full ? "#ffe9a8" : PAPER, this.flash[z.key] ? 0.5 : 0,
          full ? 4.5 : 3);
        if (full) this.drawTray(z.x + z.w / 2, z.y + z.h * 0.46, Math.min(z.w * 0.22, z.h * 0.3), Game.hands);
        else this.label(z.x + z.w / 2, z.y + z.h / 2, "🤲 hands", 10 * S, "rgba(42,33,27,.55)");
      } else if (z.kind === "bin") {
        this.panel(z.x, z.y, z.w, z.h, "#d9cdb6", this.flash[z.key] ? 0.5 : 0);
        this.label(z.x + z.w / 2, z.y + z.h / 2, "🗑️ bin", 10 * S, INK);
      }
    }
  },

  /* ---------------- the cookies ---------------- */

  // A tray: four cookies on a baking sheet. One tray IS one order, so this and
  // the picture on an order card are drawn by the same code below it.
  drawTray(cx, cy, r, tray, inOven = false) {
    const ctx = this.ctx, S = this.scale;
    const w = r * 3.4, h = r * 2.5;
    ctx.fillStyle = inOven ? "#8d8377" : "#b9b0a3";
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5 * S;
    this.roundRect(cx - w / 2, cy - h / 2, w, h, 5 * S);
    ctx.fill(); ctx.stroke();
    const o = r * 0.72;
    for (const [dx, dy] of [[-o, -o * 0.62], [o, -o * 0.62], [-o, o * 0.62], [o, o * 0.62]])
      this.drawCookie(cx + dx, cy + dy, r * 0.56, tray.shape, tray.icing, tray.sprinkles, tray.bake);
  },

  drawCookie(cx, cy, r, shapeId, icingId, sprinkles, bake) {
    const ctx = this.ctx, S = this.scale;
    const sh = SHAPE[shapeId];
    const body = BAKE_COLOUR[bake] || sh.colour;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.2, 2 * S);

    ctx.fillStyle = body;
    this.shapePath(shapeId, r);
    ctx.fill(); ctx.stroke();

    if (icingId && icingId !== "none" && bake !== "burnt") {
      ctx.fillStyle = ICING[icingId].swatch;
      this.shapePath(shapeId, r * 0.68);
      ctx.fill();
    }
    if (sprinkles && bake !== "burnt") {
      const cols = ["#ff5d8f", "#4ec3ff", "#ffe14d", "#6ee27a", "#ffffff"];
      for (let i = 0; i < 7; i++) {
        // A stable per-cookie scatter: hash2 returns a FLOAT, so scale before
        // taking a modulus or every sprinkle lands in the same place.
        const a = GK.util.hash2(i + 1, r) * Math.PI * 2;
        const d = r * (0.18 + GK.util.hash2(r, i + 3) * 0.42);
        ctx.fillStyle = cols[Math.floor(GK.util.hash2(i + 5, r) * 997) % cols.length];
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(0.9, r * 0.11), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  shapePath(id, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (id === "round") {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else if (id === "star") {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    } else if (id === "heart") {
      ctx.moveTo(0, r * 0.92);
      ctx.bezierCurveTo(-r * 1.5, -r * 0.25, -r * 0.5, -r * 1.1, 0, -r * 0.34);
      ctx.bezierCurveTo(r * 0.5, -r * 1.1, r * 1.5, -r * 0.25, 0, r * 0.92);
      ctx.closePath();
    } else if (id === "flower") {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(Math.cos(a) * r * 0.55 + r * 0.45, Math.sin(a) * r * 0.55);
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.45, 0, Math.PI * 2);
      }
      ctx.moveTo(r * 0.4, 0);
      ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    } else if (id === "moon") {
      ctx.arc(0, 0, r, Math.PI * 0.42, Math.PI * 1.58, false);
      ctx.arc(-r * 0.42, 0, r * 0.86, Math.PI * 1.5, Math.PI * 0.5, true);
      ctx.closePath();
    } else if (id === "tree") {
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.55, -r * 0.12); ctx.lineTo(r * 0.26, -r * 0.12);
      ctx.lineTo(r * 0.82, r * 0.6); ctx.lineTo(r * 0.2, r * 0.6);
      ctx.lineTo(r * 0.2, r); ctx.lineTo(-r * 0.2, r); ctx.lineTo(-r * 0.2, r * 0.6);
      ctx.lineTo(-r * 0.82, r * 0.6); ctx.lineTo(-r * 0.26, -r * 0.12);
      ctx.lineTo(-r * 0.55, -r * 0.12);
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  },

  /* ---------------- little drawing helpers ---------------- */

  panel(x, y, w, h, fill, flash = 0, lw = 3) {
    const ctx = this.ctx, S = this.scale;
    ctx.fillStyle = fill;
    this.roundRect(x, y, w, h, 11 * S); ctx.fill();
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.65, flash);
      ctx.fillStyle = "#ffffff";
      this.roundRect(x, y, w, h, 11 * S); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = lw * S;
    this.roundRect(x, y, w, h, 11 * S); ctx.stroke();
  },

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  },

  label(x, y, text, size, colour) {
    const ctx = this.ctx;
    ctx.font = `800 ${Math.round(size)}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  },

  ring(cx, cy, r, frac) {
    const ctx = this.ctx, S = this.scale;
    ctx.strokeStyle = "rgba(42,33,27,.22)"; ctx.lineWidth = 4 * S;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * GK.util.clamp(frac, 0, 1));
    ctx.stroke();
  },

  // Canvas-space point for a zone, so main.js can throw particles and floating
  // text at the thing that just happened.
  centre(key) {
    const z = this.zones.find((x) => x.key === key);
    return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: this.W / 2, y: this.H / 2 };
  },
};

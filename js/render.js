// Cookie Crumble — the tearoom on a canvas, and all the input.
//
// One fixed logical room (FIELD, 360x620) scaled to whatever stage it gets, so
// every device plays the identical floor — the leaderboard depends on that and
// so does every balance number the bots produced.
//
// Everything is a TAP, and taps commit on LIFT: pointerdown lights a target,
// sliding moves which one is lit, and only pointerup acts. A mis-aimed thumb
// costs a slide rather than a wasted trip across the room.
//
// The room is drawn back-to-front — wall, counter, floor, furniture, animals,
// server, bubbles — so the depth reads without any z-sorting cleverness. Guests
// are drawn BEFORE their tablecloth so they sit behind the table rather than
// standing in front of it.

const INK = "#2a211b";
const CREAM = "#fffdf9";

// Each animal is the same three parts — an ear shape, a head, a muzzle — so a
// new regular is a palette swap plus one silhouette.
const FUR = {
  fox:      { coat: "#ea8f45", ear: "#e07f3a", tip: "#3a2415", muzzle: "#fff3e2", shape: "point" },
  bear:     { coat: "#a97449", ear: "#9c6b42", tip: "#c99a6d", muzzle: "#e6c9a4", shape: "round" },
  rabbit:   { coat: "#f6ece0", ear: "#efe2d2", tip: "#f2b3c0", muzzle: "#ffffff", shape: "long" },
  badger:   { coat: "#efeae2", ear: "#5d5751", tip: "#3a352f", muzzle: "#ffffff", shape: "round", stripes: true },
  hedge:    { coat: "#e8cfae", ear: "#8a6440", tip: "#6b4a2e", muzzle: "#f4e4cd", shape: "spike" },
  mouse:    { coat: "#cbc4ba", ear: "#b9b2a8", tip: "#f0c3c9", muzzle: "#efe9e2", shape: "round" },
  frog:     { coat: "#8fcf70", ear: "#7fbf62", tip: "#fdfbf6", muzzle: "#a8dd8c", shape: "eyes" },
  owl:      { coat: "#c9975a", ear: "#b98a4e", tip: "#e8cfa4", muzzle: "#e8cfa4", shape: "point" },
  squirrel: { coat: "#cf8b52", ear: "#c07a45", tip: "#f2ddc2", muzzle: "#f2ddc2", shape: "point" },
};

const Render = {
  cv: null, ctx: null, stage: null,
  W: 0, H: 0, s: 1, ox: 0, oy: 0, safeB: 0,
  down: null, hover: null,
  clock: 0, flash: {}, bumps: {}, pops: [], fretT: 0,
  trims: {},

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

    const at = (e) => {
      const r = this.cv.getBoundingClientRect();
      return this.toLogical(e.clientX - r.left, e.clientY - r.top);
    };
    this.cv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const p = at(e);
      // Set the gesture state BEFORE capturing: setPointerCapture throws
      // NotFoundError whenever the browser does not consider that pointer
      // active, and `?.` does not protect you — the throw escapes and takes the
      // rest of this handler with it.
      this.down = this.hover = this.hit(p.x, p.y);
      try { this.cv.setPointerCapture?.(e.pointerId); } catch {}
    }, { passive: false });

    this.cv.addEventListener("pointermove", (e) => {
      if (!this.down) return;
      // Never gate on e.pressure: it is ZERO for ordinary touch on iOS, so the
      // obvious guard silently drops every move of a real finger.
      e.preventDefault();
      const p = at(e);
      this.hover = this.hit(p.x, p.y);
    }, { passive: false });

    this.cv.addEventListener("touchmove", (e) => {
      if (!this.down || !e.touches[0]) return;
      e.preventDefault();
      const r = this.cv.getBoundingClientRect();
      const p = this.toLogical(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
      this.hover = this.hit(p.x, p.y);
    }, { passive: false });

    this.cv.addEventListener("pointerup", (e) => {
      const p = at(e);
      const z = this.hit(p.x, p.y), started = this.down;
      this.down = this.hover = null;
      if (z && started && z.key === started.key) App.tap(z);
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
    // BACKING STORE ONLY. Display size comes from `width:100%;height:100%` in
    // the stylesheet, which is what stops a retina canvas rendering dpr-times
    // too big — an inline pixel size here goes stale the moment anything
    // reflows the stage.
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.safeB = parseFloat(getComputedStyle(this.stage).getPropertyValue("--safe-b")) || 0;
    const h = this.H - this.safeB;
    this.s = Math.min(this.W / FIELD.w, h / FIELD.h);
    this.ox = (this.W - FIELD.w * this.s) / 2;
    this.oy = (h - FIELD.h * this.s) / 2;
  },

  toScreen(x, y) { return { x: this.ox + x * this.s, y: this.oy + y * this.s }; },
  toLogical(x, y) { return { x: (x - this.ox) / this.s, y: (y - this.oy) / this.s }; },

  /* ---------------- what is tappable ---------------- */

  zones() {
    const out = [];
    if (!Game.shift) return out;
    for (const t of Game.tables)
      out.push({ kind: "table", arg: t.i, key: `t${t.i}`, x: t.x - 58, y: t.y - 40, w: 116, h: 96 });
    Game.queue.forEach((p, k) => {
      const q = QUEUE_SLOTS[Math.min(k, QUEUE_SLOTS.length - 1)];
      // Narrow enough that the two columns at the door never overlap — two
      // guests sharing a tap target is a tap with no right answer.
      out.push({ kind: "queue", arg: p.id, key: `q${p.id}`, x: q.x - 21, y: q.y - 30, w: 42, h: 58 });
    });
    out.push({ kind: "pass", arg: null, key: "pass", x: PASS.x0 - 26, y: PASS.y - 26, w: PASS.step * PASS.slots + 12, h: 62 });
    out.push({ kind: "bin", arg: null, key: "bin", x: FIELD.w - 54, y: FIELD.h - 62, w: 50, h: 56 });
    return out;
  },

  hit(x, y) {
    const zs = this.zones();
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  },

  centreOf(key) {
    const z = this.zones().find((q) => q.key === key);
    return z ? { x: z.x + z.w / 2, y: z.y + z.h / 2 } : { x: FIELD.w / 2, y: FIELD.h / 2 };
  },

  /* ---------------- events from the engine ---------------- */

  hit1(key, a = 0.4) { this.flash[key] = a; },
  bump(key) { this.bumps[key] = 0.34; },
  pop(x, y, text, colour) { this.pops.push({ x, y, text, colour: colour || CREAM, t: 0 }); },

  // Where each queued job is going, so "I tapped that and nothing happened" is
  // answered on screen: the target wears the position it sits at in her list.
  queuedMarks() {
    const marks = [];
    Game.server.tasks.forEach((k, i) => {
      if (k.tableId != null) {
        const t = Game.table(k.tableId);
        if (t) marks.push({ x: t.x + 44, y: t.y - 30, n: i + 1, kind: k.kind });
      } else if (k.kind === "collect") {
        marks.push({ x: PASS.x0 + PASS.step * PASS.slots - 24, y: PASS.y - 22, n: i + 1, kind: k.kind });
      }
    });
    return marks;
  },

  /* ---------------- frame ---------------- */

  update(dt) {
    this.clock += dt;
    for (const k of Object.keys(this.flash)) {
      this.flash[k] -= dt * 2.2;
      if (this.flash[k] <= 0) delete this.flash[k];
    }
    for (const k of Object.keys(this.bumps)) {
      this.bumps[k] -= dt;
      if (this.bumps[k] <= 0) delete this.bumps[k];
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].t += dt;
      if (this.pops[i].t > 1.1) this.pops.splice(i, 1);
    }
    // A stage can resize with no resize event at all — a web font landing, a HUD
    // row appearing. Notice the drift here rather than hunting every cause.
    const b = this.stage && this.stage.getBoundingClientRect();
    if (b && b.width > 50 && b.height > 50 &&
        (Math.abs(b.width - this.W) > 1 || Math.abs(b.height - this.H) > 1)) this.resize();

    if (Game.running) {
      this.fretT -= dt;
      if (this.fretT <= 0) {
        const worried = Game.queue.concat(Game.tables.map((t) => t.party).filter(Boolean))
          .some((p) => p.patience / p.patienceMax < 0.22);
        if (worried) { GK.Sfx.fret(); this.fretT = 0.62; } else this.fretT = 0.2;
      }
    }
  },

  render() {
    const c = this.ctx;
    if (!c || !this.W) return;
    c.clearRect(0, 0, this.W, this.H);
    c.fillStyle = "#e2c69f";
    c.fillRect(0, 0, this.W, this.H);
    if (!Game.shift) return;

    c.save();
    c.translate(this.ox, this.oy);
    c.scale(this.s, this.s);

    this.wall(c);
    this.counter(c);
    this.floor(c);
    this.doorway(c);
    for (const t of Game.tables) this.table(c, t);
    this.queue(c);
    this.trip(c);
    this.server(c);
    this.bin(c);
    this.bubbles(c);
    this.marks(c);
    this.popsLayer(c);
    this.lit(c);

    c.restore();
  },

  /* ---------------- the room ---------------- */

  wall(c) {
    const g = c.createLinearGradient(0, 0, 0, 175);
    g.addColorStop(0, "#f9e8d0"); g.addColorStop(.7, "#eed6b2"); g.addColorStop(1, "#e2c69f");
    c.fillStyle = g; c.fillRect(0, 0, FIELD.w, 175);
    c.fillStyle = "rgba(255,255,255,.3)";
    for (let x = 0; x < FIELD.w; x += 22) c.fillRect(x, 0, 3, 175);
    // The wall casts down onto the counter, which is what stops the room reading
    // as flat bands of colour.
    const sh = c.createLinearGradient(0, 140, 0, 175);
    sh.addColorStop(0, "rgba(94,58,24,0)"); sh.addColorStop(1, "rgba(94,58,24,.3)");
    c.fillStyle = sh; c.fillRect(0, 140, FIELD.w, 35);

    // window, left
    c.fillStyle = "#fffaf0"; this.round(c, 14, 24, 86, 78, 6); c.fill();
    const sky = c.createLinearGradient(0, 30, 0, 96);
    sky.addColorStop(0, "#cfeaf5"); sky.addColorStop(.6, "#a9d6ea"); sky.addColorStop(1, "#eaf6fb");
    c.fillStyle = sky; this.round(c, 20, 30, 74, 66, 3); c.fill();
    c.fillStyle = "#9ec98d";
    c.beginPath(); c.arc(38, 100, 17, Math.PI, 0); c.fill();
    c.beginPath(); c.arc(72, 102, 21, Math.PI, 0); c.fill();
    c.fillStyle = "#fffaf0"; c.fillRect(54, 30, 5, 66); c.fillRect(20, 60, 74, 5);
    c.strokeStyle = "#a97240"; c.lineWidth = 3.5; this.round(c, 14, 24, 86, 78, 6); c.stroke();

    // Daylight spilling in from the window onto the floor.
    const beam = c.createLinearGradient(60, 100, 190, 320);
    beam.addColorStop(0, "rgba(255,236,180,.4)"); beam.addColorStop(1, "rgba(255,236,180,0)");
    c.fillStyle = beam;
    c.beginPath(); c.moveTo(22, 100); c.lineTo(96, 100); c.lineTo(210, 330); c.lineTo(50, 330);
    c.closePath(); c.fill();

    // pictures on the picture rail
    for (const [x, e] of [[126, "🥐"], [152, "🌿"]]) {
      c.fillStyle = "#fffaf0"; this.round(c, x - 12, 34, 24, 28, 3); c.fill();
      c.strokeStyle = "#a97240"; c.lineWidth = 3; this.round(c, x - 12, 34, 24, 28, 3); c.stroke();
      c.font = "12px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(e, x, 49);
    }
    if (this.trims.pictures) {
      c.fillStyle = "#fffaf0"; this.round(c, 168, 38, 20, 22, 3); c.fill();
      c.strokeStyle = "#a97240"; c.lineWidth = 3; this.round(c, 168, 38, 20, 22, 3); c.stroke();
      c.font = "11px system-ui"; c.fillText("🌻", 178, 50);
    }
    if (this.trims.clock) {
      c.font = "19px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("🕰️", 206, 48);
    }

    // Two pendants over the room. Their glow is drawn on the floor, so the
    // brightest part of the screen is the near tables — the ones you tap most.
    for (const x of [104, 268]) {
      c.strokeStyle = "#6b4523"; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 16); c.stroke();
      const sg = c.createLinearGradient(0, 16, 0, 32);
      sg.addColorStop(0, "#f6cd74"); sg.addColorStop(1, "#d99a2f");
      c.fillStyle = sg;
      c.beginPath(); c.moveTo(x - 17, 32); c.lineTo(x - 9, 16); c.lineTo(x + 9, 16); c.lineTo(x + 17, 32);
      c.closePath(); c.fill();
      c.fillStyle = "#fff3c4";
      c.beginPath(); c.arc(x, 34, 4.5, 0, 7); c.fill();
      const halo = c.createRadialGradient(x, 34, 2, x, 34, 30);
      halo.addColorStop(0, "rgba(255,225,150,.6)"); halo.addColorStop(1, "rgba(255,225,150,0)");
      c.fillStyle = halo; c.beginPath(); c.arc(x, 34, 30, 0, 7); c.fill();
    }
    if (this.trims.bunting) {
      c.strokeStyle = "#c08a4a"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 12); c.quadraticCurveTo(FIELD.w / 2, 26, FIELD.w, 12); c.stroke();
      const cols = ["#d9576f", "#2f8d86", "#c98d15", "#7f5fa4", "#3d84bd"];
      for (let i = 0; i < 9; i++) {
        const x = 22 + i * 38, y = 14 + Math.sin((i / 8) * Math.PI) * 11;
        c.fillStyle = cols[i % cols.length];
        c.beginPath(); c.moveTo(x - 6, y); c.lineTo(x + 6, y); c.lineTo(x, y + 13); c.closePath(); c.fill();
      }
    }

    // dado
    c.fillStyle = "#c98f57"; c.fillRect(0, 160, FIELD.w, 15);
    c.fillStyle = "#8a5a30"; c.fillRect(0, 158, FIELD.w, 2.5);
  },

  counter(c) {
    const back = c.createLinearGradient(0, 118, 0, 144);
    back.addColorStop(0, "#c08a52"); back.addColorStop(1, "#9a6738");
    c.fillStyle = back; c.fillRect(0, 118, FIELD.w, 26);
    const slab = c.createLinearGradient(0, 140, 0, 152);
    slab.addColorStop(0, "#f0d5ac"); slab.addColorStop(1, "#cda877");
    c.fillStyle = slab; c.fillRect(0, 140, FIELD.w, 12);
    c.fillStyle = "#fff3de"; c.fillRect(0, 139, FIELD.w, 2.5);
    const front = c.createLinearGradient(0, 152, 0, 175);
    front.addColorStop(0, "#b07a45"); front.addColorStop(1, "#8a5a30");
    c.fillStyle = front; c.fillRect(0, 152, FIELD.w, 23);
    c.strokeStyle = "rgba(255,240,214,.2)"; c.lineWidth = 2;
    this.round(c, 8, 157, FIELD.w - 16, 13, 4); c.stroke();

    c.font = "bold 8px 'Baloo 2', sans-serif"; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillStyle = "#fffdf9"; c.fillText("THE PASS", 8, 128);

    // A cake under a glass dome — the one bit of the counter that is pure
    // set-dressing, and the thing that makes it read as a tearoom counter
    // rather than a shelf.
    const dx = 132;
    c.fillStyle = "#f6d9a2"; this.round(c, dx - 14, 126, 28, 12, 3); c.fill();
    c.fillStyle = "#f290a8"; this.round(c, dx - 14, 122, 28, 6, 3); c.fill();
    const dome = c.createLinearGradient(dx - 18, 108, dx + 18, 140);
    dome.addColorStop(0, "rgba(255,255,255,.55)"); dome.addColorStop(.45, "rgba(255,255,255,.12)");
    dome.addColorStop(1, "rgba(255,255,255,.4)");
    c.fillStyle = dome;
    c.beginPath(); c.moveTo(dx - 19, 139); c.lineTo(dx - 19, 124);
    c.arc(dx, 124, 19, Math.PI, 0); c.lineTo(dx + 19, 139); c.closePath(); c.fill();
    c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1.6; c.stroke();

    if (this.trims.stand) { c.font = "15px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("🍰", 168, 130); }
    if (this.trims.board) { c.font = "14px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("📋", 22, 130); }

    // plates waiting
    Game.pass.forEach((p, k) => {
      const x = PASS.x0 + k * PASS.step, y = PASS.y;
      const cold = p.age > PLATE_LIFE - 6;
      c.fillStyle = CREAM; c.beginPath(); c.arc(x, y, 15, 0, 7); c.fill();
      c.strokeStyle = cold ? "#b4553f" : "#7a5029"; c.lineWidth = 2; c.stroke();
      this.dish(c, x, y, 10, p.dish);
      if (!cold) {
        c.strokeStyle = "#ffd45e"; c.lineWidth = 2.5;
        c.globalAlpha = 0.55 + 0.45 * Math.sin(this.clock * 5 + k);
        c.beginPath(); c.arc(x, y, 19, 0, 7); c.stroke(); c.globalAlpha = 1;
      }
    });
    const f = this.flash["pass"];
    if (f) { c.fillStyle = `rgba(255,255,255,${Math.min(0.5, f)})`; c.fillRect(PASS.x0 - 26, PASS.y - 24, PASS.step * PASS.slots, 50); }
  },

  floor(c) {
    for (let x = 0; x < FIELD.w; x += 30) {
      c.fillStyle = (x / 30) % 2 ? "#cf9a5c" : "#d7a468";
      c.fillRect(x, 175, 30, FIELD.h - 175);
    }
    const g = c.createLinearGradient(0, 175, 0, 300);
    g.addColorStop(0, "rgba(80,44,12,.3)"); g.addColorStop(1, "rgba(80,44,12,0)");
    c.fillStyle = g; c.fillRect(0, 175, FIELD.w, 125);

    // Warm pools under the two pendants. Always on — this is the lighting the
    // room is built around, not something you buy.
    for (const x of [104, 268]) {
      const p = c.createRadialGradient(x, 250, 6, x, 250, 132);
      p.addColorStop(0, "rgba(255,222,158,.32)"); p.addColorStop(1, "rgba(255,222,158,0)");
      c.fillStyle = p;
      c.beginPath(); c.ellipse(x, 250, 132, 108, 0, 0, 7); c.fill();
    }

    if (this.trims.rug) {
      c.fillStyle = "rgba(200,90,110,.35)";
      c.beginPath(); c.ellipse(FIELD.w / 2, 400, 130, 78, 0, 0, 7); c.fill();
    }
    if (this.trims.lamps) {
      for (const x of [90, 270]) {
        const lg = c.createRadialGradient(x, 210, 4, x, 210, 96);
        lg.addColorStop(0, "rgba(255,220,150,.42)"); lg.addColorStop(1, "rgba(255,220,150,0)");
        c.fillStyle = lg; c.beginPath(); c.arc(x, 210, 96, 0, 7); c.fill();
      }
    }
    if (this.trims.plant) { c.font = "20px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("🪴", 22, 200); }
    if (this.trims.flowers) { c.font = "13px system-ui"; c.textAlign = "center"; c.textBaseline = "middle"; }
    if (this.trims.cat) {
      c.font = "20px system-ui"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("🐈", 330, 205 + Math.sin(this.clock * 0.8) * 2);
    }
    if (this.trims.trophy) { c.font = "16px system-ui"; c.textAlign = "center"; c.fillText("🏆", 340, 130); }
    if (this.trims.birds) { c.font = "16px system-ui"; c.textAlign = "center"; c.fillText("🐦", 300, 40); }
  },

  doorway(c) {
    c.fillStyle = "rgba(120,72,26,.16)";
    this.round(c, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 10); c.fill();
    c.setLineDash([6, 6]); c.strokeStyle = "rgba(255,240,214,.6)"; c.lineWidth = 2;
    this.round(c, DOOR.x, DOOR.y, DOOR.w, DOOR.h, 10); c.stroke(); c.setLineDash([]);
    c.font = "bold 8px 'Baloo 2', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#5a4326"; c.fillText("DOOR", DOOR.x + DOOR.w / 2, DOOR.y + 10);
  },

  /* ---------------- furniture and guests ---------------- */

  table(c, t) {
    const cloth = CLOTH[t.cloth].hex;
    const lit = this.down && this.hover && this.hover.key === `t${t.i}`;
    const bump = this.bumps[`t${t.i}`];
    if (bump) { c.save(); c.translate(Math.sin(bump * 60) * 4, 0); }

    // A soft shadow built from three stacked ellipses rather than a canvas
    // blur filter, which is expensive per frame and behaves differently across
    // browsers. Same look, no cost.
    for (const [r, a] of [[62, .09], [56, .12], [50, .16]]) {
      c.fillStyle = `rgba(70,38,10,${a})`;
      c.beginPath(); c.ellipse(t.x, t.y + 27, r, r * 0.25, 0, 0, 7); c.fill();
    }
    // chairs, with a ledge so they sit on the floor
    for (const dx of [-46, 46]) {
      c.fillStyle = "#6f4720"; this.round(c, t.x + dx - 13, t.y + 1, 26, 26, 8); c.fill();
      const cg = c.createLinearGradient(0, t.y - 4, 0, t.y + 22);
      cg.addColorStop(0, "#a2703f"); cg.addColorStop(1, "#7f5528");
      c.fillStyle = cg; this.round(c, t.x + dx - 13, t.y - 4, 26, 26, 8); c.fill();
    }

    // Guests are drawn BEFORE the cloth, so the table overlaps their chins and
    // they read as sitting behind it rather than standing in front.
    if (t.party) {
      const g = GUEST[t.party.type];
      const n = Math.min(3, t.party.size);
      for (let k = 0; k < n; k++) {
        const dx = (k - (n - 1) / 2) * 26;
        this.animal(c, t.x + dx, t.y - 24, 15, g.animal);
      }
    }

    // The cloth: a solid colour ledge underneath, the cloth over it, and one
    // soft highlight up on the top-left. Those three together are the whole
    // difference between "flat" and "there".
    c.fillStyle = GK.util.shade(cloth, -42);
    c.beginPath(); c.ellipse(t.x, t.y + 13, 54, 22, 0, 0, 7); c.fill();
    const grd = c.createRadialGradient(t.x - 16, t.y - 2, 4, t.x, t.y + 6, 60);
    grd.addColorStop(0, GK.util.shade(cloth, 40)); grd.addColorStop(.62, cloth);
    grd.addColorStop(1, GK.util.shade(cloth, -18));
    c.fillStyle = grd;
    c.beginPath(); c.ellipse(t.x, t.y + 8, 54, 22, 0, 0, 7); c.fill();
    c.fillStyle = "rgba(255,255,255,.22)";
    c.beginPath(); c.ellipse(t.x - 15, t.y + 1, 21, 7, -0.25, 0, 7); c.fill();

    // what is on the table
    if (t.state === "free") {
      // On a cream card rather than straight onto the cloth: 9px lettering needs
      // 4.5:1 and pale-on-rose only manages 3.8, so the label carries its own
      // background instead of depending on the tablecloth it lands on.
      c.fillStyle = "rgba(255,253,249,.92)";
      this.round(c, t.x - 21, t.y, 42, 15, 7); c.fill();
      c.font = "bold 9px 'Baloo 2', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = INK; c.fillText("FREE", t.x, t.y + 8);
    }
    if (t.has.length) t.has.forEach((d, k) => {
      const dx = (k - (t.has.length - 1) / 2) * 22;
      c.fillStyle = CREAM; c.beginPath(); c.arc(t.x + dx, t.y + 6, 10, 0, 7); c.fill();
      this.dish(c, t.x + dx, t.y + 6, 7, d);
    });
    if (t.state === "dirty") {
      c.fillStyle = "#8a5a30";
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + t.i;
        c.beginPath(); c.arc(t.x + Math.cos(a) * 26, t.y + 6 + Math.sin(a) * 9, 2.6, 0, 7); c.fill();
      }
    }

    const f = this.flash[`t${t.i}`];
    if (f || lit) {
      c.strokeStyle = lit ? INK : `rgba(255,255,255,${Math.min(0.8, f)})`;
      c.lineWidth = lit ? 3 : 4;
      this.round(c, t.x - 58, t.y - 40, 116, 96, 12); c.stroke();
    }
    if (bump) c.restore();
  },

  queue(c) {
    Game.queue.forEach((p, k) => {
      const q = QUEUE_SLOTS[Math.min(k, QUEUE_SLOTS.length - 1)];
      const g = GUEST[p.type];
      const picked = Game.selected === p;
      const lit = this.down && this.hover && this.hover.key === `q${p.id}`;
      if (picked || lit) {
        c.fillStyle = picked ? "rgba(255,212,94,.5)" : "rgba(255,255,255,.3)";
        this.round(c, q.x - 28, q.y - 28, 56, 56, 12); c.fill();
      }
      c.fillStyle = CLOTH[p.cloth].hex;
      this.round(c, q.x - 17, q.y + 14, 34, 6, 3); c.fill();
      this.animal(c, q.x, q.y - 4, 16, g.animal);
      this.hearts(c, q.x, q.y + 26, p);
    });
  },

  server(c) {
    const s = Game.server;
    c.fillStyle = "rgba(70,38,10,.28)";
    c.beginPath(); c.ellipse(s.x, s.y + 15, 20, 7, 0, 0, 7); c.fill();
    this.animal(c, s.x, s.y, 19, "owl");
    // apron
    c.fillStyle = CREAM;
    c.beginPath(); c.moveTo(s.x - 11, s.y + 12); c.quadraticCurveTo(s.x, s.y + 20, s.x + 11, s.y + 12);
    c.lineTo(s.x + 8, s.y + 20); c.lineTo(s.x - 8, s.y + 20); c.closePath(); c.fill();

    if (s.carrying.length) {
      const tx = s.x + 24, ty = s.y - 2;
      c.fillStyle = "#e0c9a3"; this.round(c, tx - 13, ty - 5, 26, 10, 3); c.fill();
      c.strokeStyle = "#8a5a30"; c.lineWidth = 1.5; this.round(c, tx - 13, ty - 5, 26, 10, 3); c.stroke();
      s.carrying.forEach((d, k) => {
        const dx = (k - (s.carrying.length - 1) / 2) * 12;
        c.fillStyle = CREAM; c.beginPath(); c.arc(tx + dx, ty - 8, 7, 0, 7); c.fill();
        this.dish(c, tx + dx, ty - 8, 5, d);
      });
    }
  },

  // The trip she is on, drawn as a dotted line. Half of "the controls feel bad"
  // is not being able to see that a tap was heard — this makes the walk itself
  // the feedback.
  trip(c) {
    const task = Game.server.tasks[0];
    if (!task) return;
    const leg = task.legs[task.leg];
    if (!leg || leg.here) return;
    c.save();
    c.strokeStyle = "rgba(255,253,249,.75)"; c.lineWidth = 3;
    c.setLineDash([2, 9]); c.lineCap = "round";
    c.beginPath(); c.moveTo(Game.server.x, Game.server.y); c.lineTo(leg.x, leg.y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = "rgba(255,253,249,.8)";
    c.beginPath(); c.arc(leg.x, leg.y, 4.5, 0, 7); c.fill();
    c.restore();
  },

  // A numbered pip on anything she is queued to visit.
  marks(c) {
    for (const m of this.queuedMarks()) {
      c.fillStyle = m.n === 1 ? "#ffd45e" : CREAM;
      c.beginPath(); c.arc(m.x, m.y, 9, 0, 7); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
      c.font = "bold 10px 'Baloo 2', sans-serif";
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = INK; c.fillText(String(m.n), m.x, m.y + 0.5);
    }
  },

  bin(c) {
    const lit = this.down && this.hover && this.hover.key === "bin";
    const x = FIELD.w - 29, y = FIELD.h - 34;
    c.fillStyle = lit ? "#c9b393" : "#b7a184";
    this.round(c, x - 18, y - 20, 36, 40, 7); c.fill();
    c.strokeStyle = "#6f5335"; c.lineWidth = 2; this.round(c, x - 18, y - 20, 36, 40, 7); c.stroke();
    c.font = "bold 8px 'Baloo 2', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#4a3524"; c.fillText("BIN", x, y + 2);
  },

  // Speech bubbles last, so nothing overlaps them.
  bubbles(c) {
    for (const t of Game.tables) {
      if (!t.party) continue;
      const y = t.y - 52;
      if (t.state === "seated") this.bubble(c, t.x, y, (bc) => {
        bc.font = "bold 15px 'Baloo 2', sans-serif"; bc.fillStyle = INK;
        bc.textAlign = "center"; bc.textBaseline = "middle"; bc.fillText("?", t.x, y);
      }, 26, t.party);
      else if (t.state === "ordered") this.bubble(c, t.x, y, (bc) => {
        t.wants.forEach((d, k) => {
          const dx = (k - (t.wants.length - 1) / 2) * 20;
          this.dish(bc, t.x + dx, y, 8, d);
        });
      }, Math.max(26, t.wants.length * 20 + 8), t.party);
      else if (t.state === "eating") this.bubble(c, t.x, y, (bc) => {
        bc.font = "13px system-ui"; bc.textAlign = "center"; bc.textBaseline = "middle";
        bc.fillText("😊", t.x, y);
      }, 26, t.party);
      else if (t.state === "bill") this.bubble(c, t.x, y, (bc) => {
        bc.font = "bold 12px 'Baloo 2', sans-serif"; bc.textAlign = "center"; bc.textBaseline = "middle";
        bc.fillStyle = "#7a5200"; bc.fillText("🪙", t.x, y);
      }, 26, t.party, "#ffd45e");
    }
  },

  bubble(c, x, y, draw, w, party, fill) {
    c.fillStyle = fill || CREAM;
    this.round(c, x - w / 2, y - 15, w, 30, 9); c.fill();
    c.beginPath(); c.moveTo(x - 6, y + 14); c.lineTo(x + 6, y + 14); c.lineTo(x, y + 21); c.closePath(); c.fill();
    draw(c);
    if (party) this.hearts(c, x, y - 22, party);
  },

  hearts(c, x, y, p) {
    const n = Math.max(0, Math.ceil((p.patience / p.patienceMax) * 3));
    const worried = n <= 1;
    for (let k = 0; k < 3; k++) {
      c.fillStyle = k < n ? (worried ? "#e0503f" : "#e0546c") : "rgba(70,38,10,.22)";
      const hx = x + (k - 1) * 9;
      const sc = k < n && worried ? 1 + Math.sin(this.clock * 9) * 0.16 : 1;
      c.save(); c.translate(hx, y); c.scale(sc, sc);
      c.beginPath();
      c.moveTo(0, 3.4); c.bezierCurveTo(-4.6, -0.8, -3.2, -4.2, 0, -1.8);
      c.bezierCurveTo(3.2, -4.2, 4.6, -0.8, 0, 3.4); c.fill();
      c.restore();
    }
  },

  popsLayer(c) {
    c.textAlign = "center"; c.textBaseline = "middle";
    for (const p of this.pops) {
      const a = 1 - p.t / 1.1;
      c.globalAlpha = Math.max(0, a);
      c.font = "bold 14px 'Baloo 2', sans-serif";
      c.lineWidth = 3; c.strokeStyle = "rgba(60,36,12,.65)";
      c.strokeText(p.text, p.x, p.y - p.t * 28);
      c.fillStyle = p.colour; c.fillText(p.text, p.x, p.y - p.t * 28);
    }
    c.globalAlpha = 1;
  },

  // Whatever the finger is resting on, lit but not yet committed.
  lit(c) {
    if (!this.down || !this.hover || this.hover.key !== this.down.key) return;
    const z = this.hover;
    if (z.kind === "table" || z.kind === "queue") return;   // drawn in place already
    c.strokeStyle = INK; c.lineWidth = 3;
    this.round(c, z.x, z.y, z.w, z.h, 10); c.stroke();
  },

  /* ---------------- little drawings ---------------- */

  animal(c, x, y, r, kind) {
    const f = FUR[kind] || FUR.rabbit;
    c.save(); c.translate(x, y);

    if (f.shape === "point") {
      c.fillStyle = f.ear;
      for (const sx of [-1, 1]) {
        c.beginPath(); c.moveTo(sx * r * 0.62, -r * 0.5); c.lineTo(sx * r * 0.85, -r * 1.35);
        c.lineTo(sx * r * 0.15, -r * 0.85); c.closePath(); c.fill();
      }
    } else if (f.shape === "round") {
      c.fillStyle = f.ear;
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.72, -r * 0.72, r * 0.4, 0, 7); c.fill(); }
      c.fillStyle = f.tip;
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.72, -r * 0.72, r * 0.21, 0, 7); c.fill(); }
    } else if (f.shape === "long") {
      c.fillStyle = f.ear;
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.42, -r * 1.05, r * 0.24, r * 0.62, 0, 0, 7); c.fill(); }
      c.fillStyle = f.tip;
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.42, -r * 1.0, r * 0.12, r * 0.42, 0, 0, 7); c.fill(); }
    } else if (f.shape === "spike") {
      c.fillStyle = f.tip;
      c.beginPath();
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI + (k / 8) * Math.PI;
        const rr = k % 2 ? r * 1.24 : r * 0.98;
        c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.92);
      }
      c.closePath(); c.fill();
    }

    c.fillStyle = f.coat; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();

    if (f.stripes) {
      c.fillStyle = f.tip;
      for (const sx of [-1, 1]) {
        c.beginPath(); c.ellipse(sx * r * 0.52, -r * 0.06, r * 0.2, r * 0.84, 0, 0, 7); c.fill();
      }
    }
    if (f.shape === "eyes") {
      c.fillStyle = f.ear;
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.56, -r * 0.72, r * 0.42, 0, 7); c.fill(); }
      c.fillStyle = "#fdfbf6";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.56, -r * 0.72, r * 0.24, 0, 7); c.fill(); }
      c.fillStyle = "#1d1a16";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.56, -r * 0.7, r * 0.12, 0, 7); c.fill(); }
    }

    c.fillStyle = f.muzzle;
    c.beginPath(); c.ellipse(0, r * 0.36, r * 0.54, r * 0.4, 0, 0, 7); c.fill();

    if (kind === "owl") {
      c.fillStyle = "#fdfbf6";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.34, -r * 0.16, r * 0.34, 0, 7); c.fill(); }
      c.fillStyle = "#241a11";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.34, -r * 0.16, r * 0.18, 0, 7); c.fill(); }
      c.fillStyle = "#e8a33c";
      c.beginPath(); c.moveTo(0, r * 0.06); c.lineTo(-r * 0.15, r * 0.3); c.lineTo(r * 0.15, r * 0.3); c.closePath(); c.fill();
    } else if (f.shape !== "eyes") {
      c.fillStyle = "#2c1b0f";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.32, -r * 0.14, r * 0.14, 0, 7); c.fill(); }
      c.fillStyle = "#fff";
      for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * r * 0.32 + r * 0.05, -r * 0.2, r * 0.05, 0, 7); c.fill(); }
      c.fillStyle = "#2c1b0f";
      c.beginPath(); c.ellipse(0, r * 0.24, r * 0.13, r * 0.1, 0, 0, 7); c.fill();
    }
    c.restore();
  },

  dish(c, x, y, r, id) {
    const d = DISH[id];
    if (!d) return;
    if (d.icon === "tea") {
      c.fillStyle = "#fdfbf6"; this.round(c, x - r * 0.8, y - r * 0.6, r * 1.5, r * 1.3, r * 0.3); c.fill();
      c.fillStyle = "#7fb8c9"; this.round(c, x - r * 0.8, y - r * 0.6, r * 1.5, r * 0.4, r * 0.2); c.fill();
      c.strokeStyle = "#cdbfa8"; c.lineWidth = r * 0.24;
      c.beginPath(); c.arc(x + r * 0.9, y, r * 0.34, -1.2, 1.2); c.stroke();
    } else if (d.icon === "cake") {
      c.fillStyle = "#e8c88e"; this.round(c, x - r * 0.85, y - r * 0.1, r * 1.7, r * 0.95, r * 0.2); c.fill();
      c.fillStyle = "#f290a8";
      c.beginPath(); c.moveTo(x - r * 0.85, y - r * 0.1);
      c.quadraticCurveTo(x - r * 0.4, y - r * 0.75, x, y - r * 0.1);
      c.quadraticCurveTo(x + r * 0.45, y - r * 0.75, x + r * 0.85, y - r * 0.1);
      c.closePath(); c.fill();
      c.fillStyle = "#e0546c"; c.beginPath(); c.arc(x, y - r * 0.68, r * 0.2, 0, 7); c.fill();
    } else if (d.icon === "scone") {
      c.fillStyle = "#e3b678";
      c.beginPath(); c.moveTo(x - r * 0.85, y + r * 0.35);
      c.quadraticCurveTo(x, y - r * 1.0, x + r * 0.85, y + r * 0.35); c.closePath(); c.fill();
      c.fillStyle = "#f6efe2"; this.round(c, x - r * 0.9, y + r * 0.25, r * 1.8, r * 0.34, r * 0.16); c.fill();
      c.fillStyle = "#e3b678"; this.round(c, x - r * 0.9, y + r * 0.52, r * 1.8, r * 0.32, r * 0.14); c.fill();
    } else {
      c.fillStyle = "#d99a52"; c.beginPath(); c.arc(x, y, r * 0.92, 0, 7); c.fill();
      c.fillStyle = "#5b3a24";
      for (const [dx, dy] of [[-0.34, -0.28], [0.34, -0.1], [-0.1, 0.4]]) {
        c.beginPath(); c.arc(x + dx * r, y + dy * r, r * 0.18, 0, 7); c.fill();
      }
    }
  },

  round(c, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  },
};

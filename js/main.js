// Cookie Crumble — screens, storage wiring and the frame loop.
//
// Everything that touches the DOM lives here. game.js decides what is true and
// emits events; this file makes a noise about them and writes them down.

// Every refusal the engine can hand back, in words a seven-year-old can act on.
// The engine returns a reason code so it can be asserted on without pinning a
// sentence somebody is going to reword — and so the ones that mean "she tapped
// a station that has nothing to say right now" can stay silent rather than
// nagging.
const EXCUSES = {
  hands: "Your hands are full — put that down first!",
  empty: "Your hands are empty.",
  noDough: "Mix a bowl of dough first! 🥣",
  pickCutter: "The dough is ready — pick a cutter!",
  iced: "Iced cookies don't go back in the oven.",
  raw: "That one still needs baking. 🔥",
  burnt: "That's burnt, I'm afraid — pop it in the bin. 🗑️",
  noTray: "Put a baked tray on the icing table first.",
  noScraper: "No scraper left! The Corner Shop sells them. 🥄",
  already: "It's already that colour!",
};

const App = {
  profile: null,
  progress: null,
  kit: null,
  active: false,
  paused: false,
  lastTs: 0,
  token: 0,               // bumped on every entry and exit; see `later()`
  _banked: 0,
  pendingShift: 0,

  init() {
    Render.boot();
    this.wireGame();

    GK.UI.onScreenChange = (name) => {
      this.active = name === "game";
      if (name === "game") Render.resize();
      if (name === "splash") this.refreshSplash();
    };

    GK.Profiles.init({
      storage: Storage,
      avatars: ["🍪", "🧁", "🐱", "🦄", "🦖", "🐰", "🦉", "🐻", "🌈", "🍓", "🤖", "👑"],
      meta: (p, prog) => `⭐ ${Storage.totalStars(prog)}/${SHIFTS.length * 3} · 🪙 ${Storage.coins(prog)}`,
      onEnter: (p) => this.enter(p),
      addLabel: "New Baker",
    });

    GK.initPWA({ appName: "Cookie Crumble" });
    GK.UI.bindSoundToggle(Storage);

    Storage.initFirebase().then((live) => {
      const badge = document.getElementById("sync-badge");
      if (badge) badge.textContent = live ? "☁️ synced with the family" : "📴 this device only";
    });

    this.refreshSplash();

    GK.Debug.init({ storage: Storage, title: "COOKIE CRUMBLE" })
      .jump("shift", SHIFTS.length, (n) => this.startShift(n - 1))
      .action("+500 coins", () => { this.progress = Storage.addCoins(this.profile.id, 500); this.showMap(); })
      .action("the big rush", () => this.beginRun({ mode: "rush" }));

    requestAnimationFrame((ts) => this.frame(ts));
  },

  /* ---------------- splash & profiles ---------------- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const btn = document.getElementById("btn-continue-as");
    if (!btn) return;
    if (last) {
      btn.style.display = "";
      btn.innerHTML = `${last.avatar} Back to the shop, ${GK.util.esc(last.name)}`;
      btn.onclick = () => GK.Profiles.select(last);
    } else {
      btn.style.display = "none";
    }
  },

  play() { GK.Profiles.renderList(); GK.UI.showScreen("profiles"); },

  enter(profile) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.kit = upgradeLoadout(this.progress);
    GK.Sfx.init();
    this.showMap();
  },

  /* ---------------- the map ---------------- */

  showMap() {
    this.progress = Storage.getProgress(this.profile.id);
    this.kit = upgradeLoadout(this.progress);
    const unlocked = Storage.unlockedShift(this.progress);

    document.getElementById("map-player").innerHTML =
      `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>` +
      `<span class="map-stats">⭐ ${Storage.totalStars(this.progress)} · 🪙 ${Storage.coins(this.progress)}</span>`;

    const cont = document.getElementById("btn-continue");
    cont.innerHTML = `▶️ Shift ${unlocked + 1} — ${GK.util.esc(SHIFTS[unlocked].name)}`;
    cont.onclick = () => this.startShift(unlocked);

    const rush = document.getElementById("btn-rush");
    const open = Storage.rushUnlocked(this.progress);
    rush.disabled = !open;
    rush.innerHTML = open
      ? `⏱️ The Big Rush${this.progress.rushScore ? ` — best ${this.progress.rushScore}` : ""}`
      : `🔒 The Big Rush (pass ${RUSH_UNLOCK_SHIFTS} shifts)`;

    document.getElementById("shift-list").innerHTML = WEEKS.map((week, wi) => {
      const rows = shiftsInWeek(wi);
      const done = rows.every(([, i]) => this.progress.shifts[i]);
      return `<section class="week${done ? " done" : ""}" style="--week:${week.hue}">
        <header class="week-head"><span class="week-icon">${week.icon}</span>
          <div class="week-text"><h3>Week ${wi + 1} · ${GK.util.esc(week.name)}</h3>
            <span class="week-blurb">${GK.util.esc(week.blurb)}</span></div>
          ${done ? '<span class="week-tick">✔</span>' : ""}</header>
        <div class="shift-row">${rows.map(([s, i]) => this.shiftCard(s, i, unlocked)).join("")}</div>
      </section>`;
    }).join("");

    GK.UI.showScreen("map");
  },

  shiftCard(s, i, unlocked) {
    const rec = (this.progress.shifts || {})[i];
    const locked = i > unlocked;
    const stars = rec ? rec.stars : 0;
    const pips = locked ? "🔒" : "★★★".slice(0, stars).padEnd(3, "☆");
    return `<button class="shift-card${locked ? " locked" : ""}${i === unlocked ? " next" : ""}${s.big ? " big" : ""}"
      ${locked ? "disabled" : ""} onclick="App.startShift(${i})"
      aria-label="Shift ${i + 1}, ${GK.util.esc(s.name)}${locked ? ", locked" : `, ${stars} stars`}">
      <span class="sc-num">${s.big ? "🎉" : i + 1}</span>
      <span class="sc-name">${GK.util.esc(s.name)}</span>
      <span class="sc-stars">${pips}</span></button>`;
  },

  /* ---------------- today's shopping ---------------- */

  // Dulcie's step one, and it earns its place: this is where you find out which
  // cutters and colours today actually has, which is exactly what you need to
  // know before the first customer walks in.
  startShift(idx) {
    this.pendingShift = idx;
    const s = SHIFTS[idx];
    const box = document.getElementById("shop-list-body");
    box.innerHTML =
      `<p class="sl-shift">Shift ${idx + 1} · <b>${GK.util.esc(s.name)}</b></p>` +
      `<div class="sl-group"><h4>Cutters</h4><div class="sl-items">` +
      s.shapes.map((id) => `<span class="sl-item">${SHAPE[id].icon} ${SHAPE[id].name}</span>`).join("") +
      `</div></div>` +
      `<div class="sl-group"><h4>Icing</h4><div class="sl-items">` +
      s.icings.map((id) => id === "none"
        ? `<span class="sl-item">🚫 Plain (no icing)</span>`
        : `<span class="sl-item"><i style="background:${ICING[id].swatch}"></i> ${ICING[id].name}</span>`).join("") +
      (s.sprinkles ? `<span class="sl-item">✨ Sprinkles</span>` : "") +
      `</div></div>` +
      `<p class="sl-tip">${GK.util.esc(s.tip || "Keep the oven full and nobody waits long.")}</p>` +
      `<p class="sl-crowd">👥 ${s.count} customers · up to ${s.maxWaiting} at the counter</p>`;
    GK.UI.openModal("modal-shopping");
  },

  confirmShopping() {
    GK.UI.closeModal("modal-shopping");
    this.beginRun({ mode: "shift", shiftIdx: this.pendingShift });
  },

  startRush() {
    if (!Storage.rushUnlocked(this.progress)) return;
    this.beginRun({ mode: "rush" });
  },

  beginRun(cfg) {
    GK.Sfx.init();
    this._banked = 0;
    this.paused = false;
    this.token++;
    Fx.reset();
    Game.start({ ...cfg, kit: this.kit });

    GK.UI.showScreen("game");
    // Fill the HUD BEFORE measuring: its content sizes the stage, and measuring
    // first gives a layout that is already out of date.
    this.updateHud();
    Render.resize();
    Render.layoutZones();
  },

  /* ---------------- the taps ---------------- */

  tap(kind, arg, key) {
    if (this.paused || !Game.running) return;
    const res =
      kind === "bench" ? Game.tapBench()
      : kind === "cutter" ? Game.tapCutter(arg)
      : kind === "oven" ? Game.tapOven(arg)
      : kind === "rack" ? Game.tapRack(arg)
      : kind === "table" ? Game.tapTable()
      : kind === "icing" ? Game.tapIcing(arg)
      : kind === "sprinkles" ? Game.tapSprinkles()
      : kind === "customer" ? Game.tapCustomer(arg)
      : kind === "bin" ? Game.tapBin()
      : kind === "hands" ? { ok: false, why: "hands" }
      : { ok: false, why: "unknown" };

    if (res.ok) { Render.hit(key); return; }
    const words = EXCUSES[res.why];
    if (words) { GK.UI.toast(words); Render.shake(key); }
  },

  wireGame() {
    Game.on = {
      mixStart: () => GK.Sfx.mixing(),
      mixDone: () => { GK.Sfx.doughReady(); Render.hit("bench:", 0.5); },
      cutStart: () => GK.Sfx.cut(),
      cutDone: () => { GK.Sfx.place(); this.updateHud(); },

      ovenIn: (d) => { GK.Sfx.ovenIn(); Render.hit(`oven:${d.slot}`); },

      bakePhase: (d) => {
        if (d.phase === "perfect") {
          GK.Sfx.ding();
          const p = Render.centre(`oven:${d.slot}`);
          Fx.sparkle(p.x, p.y, 8);
        } else if (d.phase === "crisp") {
          GK.Sfx.smoke();
        } else if (d.phase === "burnt") {
          GK.Sfx.smoke();
          Fx.addShake(4);
        }
      },

      ovenOut: (d) => {
        const p = Render.centre(`oven:${d.slot}`);
        if (d.phase === "perfect") {
          GK.Sfx.perfect();
          Fx.burst(p.x, p.y, "#ffd63d", 12, 150, 0.5, 3);
          Fx.text(p.x, p.y, "just right!", { color: "#2f8f4f", size: 13 });
        } else if (d.phase === "crisp") {
          GK.Sfx.crisp();
        } else {
          GK.Sfx.bin();
        }
        this.updateHud();
      },

      park: () => GK.Sfx.place(),
      pick: () => GK.Sfx.lift(),
      tableIn: () => GK.Sfx.place(),
      iced: () => GK.Sfx.ice(),
      sprinkled: (d) => { if (d.on) GK.Sfx.sprinkle(); else GK.Sfx.place(); },
      scrape: (d) => { GK.Sfx.scrape(); GK.UI.toast(`🥄 Scraped it off — ${d.left} left today.`); },
      binned: () => GK.Sfx.bin(),

      arrive: () => { GK.Sfx.doorbell(); this.updateHud(); },

      served: (d) => {
        GK.Sfx.sold(d.coins);
        const p = Render.centre(`customer:${d.customer.id}`);
        Fx.burst(p.x, p.y, "#ffd63d", 14, 160, 0.6, 3);
        Fx.text(p.x, p.y, `+${d.coins}`, { color: "#a35a2a", size: 15 });
        if (d.tip >= 3) Fx.text(p.x, p.y + 16, "quick service!", { color: "#2f8f4f", size: 11 });
        this.bankCoins();
        this.updateHud();
      },

      refused: (d) => {
        GK.Sfx.nope();
        Render.shake(`customer:${d.customer.id}`);
        GK.UI.toast(d.reason === "burnt" ? "Nobody wants a burnt one! 🗑️" : "That's not what they asked for. 🙂");
      },

      leave: (d) => {
        GK.Sfx.leave();
        Fx.addShake(5);
        GK.UI.toast("Somebody gave up waiting… 😕");
        this.updateHud();
      },

      shiftEnd: (r) => this.finishRun(r),
    };
  },

  /* ---------------- HUD ---------------- */

  updateHud() {
    const rush = Game.mode === "rush";
    document.getElementById("hud-shift").textContent = rush
      ? "⏱️ The Big Rush"
      : `${Game.shiftIdx + 1}. ${SHIFTS[Game.shiftIdx].name}`;
    document.getElementById("hud-left").textContent = rush
      ? `😕 ${RUSH.mistakes - Game.lost}`
      : `👥 ${Math.max(0, Game.shift.count - Game.resolved())}`;
    document.getElementById("hud-lost").textContent = rush || !Game.shift.maxLost
      ? "" : `😕 ${Game.lost}/${Game.shift.maxLost}`;
    document.getElementById("hud-coins").textContent = `🪙 ${Game.coins}`;
    const sc = document.getElementById("btn-scraper");
    sc.style.display = Game.scraperLeft > 0 ? "" : "none";
    sc.textContent = `🥄 ${Game.scraperLeft}`;
  },

  // Banked as they are won, so a shift that collapses still keeps what it
  // earned on the way — and replaying an old shift is a real way to save up.
  bankCoins() {
    const delta = Game.coins - this._banked;
    if (delta > 0) {
      this._banked = Game.coins;
      this.progress = Storage.addCoins(this.profile.id, delta);
    }
  },

  pause() { if (!Game.running) return; this.paused = true; GK.UI.openModal("modal-pause"); },
  resume() { this.paused = false; GK.UI.closeModal("modal-pause"); },
  quit() {
    this.paused = false;
    GK.UI.closeModal("modal-pause");
    this.token++;              // any pending transition belongs to a run she left
    Game.abandon();
    this.showMap();
  },

  // A delayed screen change captures the token and re-checks it, or quitting
  // inside the pause before the results screen yanks her out of the map and
  // into a shift she walked away from. Clearing an animation queue does not
  // help — the timeout was scheduled before that and holds its own reference.
  later(fn, ms) {
    const token = this.token;
    setTimeout(() => { if (this.token === token) fn(); }, ms);
  },

  /* ---------------- results ---------------- */

  finishRun(r) {
    this.bankCoins();
    this.progress = Storage.recordShift(this.profile.id, r);
    this.kit = upgradeLoadout(this.progress);
    this.later(() => this.showResults(r), 620);
  },

  showResults(r) {
    const rush = r.mode === "rush";
    const best = rush && r.score >= (this.progress.rushScore || 0) && r.score > 0;

    document.getElementById("res-emoji").textContent =
      rush ? (best ? "🏆" : "⏱️") : ["😊", "🙂", "😄", "🥳"][r.stars];
    document.getElementById("res-title").textContent = rush
      ? (best ? "New best takings!" : "Closing time!")
      : (r.win ? "Shift finished!" : "Oh dear — have another go.");

    const starsEl = document.getElementById("res-stars");
    starsEl.innerHTML = "";
    starsEl.style.display = rush ? "none" : "";

    document.getElementById("res-score").textContent = "0";
    document.getElementById("res-served").textContent = `🧑 ${r.served} served${r.lost ? ` · ${r.lost} gave up` : ""}`;
    document.getElementById("res-bake").textContent =
      r.served ? `🔥 ${r.perfect} of ${r.served} baked just right` : "";
    document.getElementById("res-extra").textContent =
      [r.crisp ? `${r.crisp} a bit crispy` : "", r.binned ? `${r.binned} binned` : ""]
        .filter(Boolean).join(" · ");
    document.getElementById("res-next-star").textContent =
      (!rush && r.win && r.stars < 3)
        ? (r.stars === 1 ? "⭐ Serve everybody for two stars." : "⭐ Bake most of them just right for three.")
        : "";

    const nextIdx = r.shiftIdx + 1;
    const retry = document.getElementById("res-retry");
    const next = document.getElementById("res-next");
    if (rush) {
      retry.style.display = ""; retry.innerHTML = "⏱️ Again";
      retry.onclick = () => this.startRush();
      next.style.display = "none";
    } else if (r.win && nextIdx < SHIFTS.length) {
      retry.style.display = ""; retry.innerHTML = "🔁 Replay";
      retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = ""; next.innerHTML = "▶️ Next shift";
      next.onclick = () => this.startShift(nextIdx);
    } else if (r.win) {
      retry.style.display = "none";
      next.style.display = ""; next.innerHTML = "⏱️ Try The Big Rush";
      next.onclick = () => this.startRush();
    } else {
      retry.style.display = ""; retry.innerHTML = "🔁 Try again";
      retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = "none";
    }

    document.getElementById("res-finished").style.display =
      (!rush && r.win && nextIdx >= SHIFTS.length) ? "" : "none";

    GK.UI.showScreen("results");

    if (!rush) {
      for (let i = 0; i < 3; i++) {
        this.later(() => {
          const s = document.createElement("span");
          s.className = "res-star" + (i < r.stars ? " on" : "");
          s.textContent = i < r.stars ? "★" : "☆";
          starsEl.appendChild(s);
          if (i < r.stars) GK.Sfx.star(i);
        }, 260 + i * 360);
      }
    }

    this.countUp(document.getElementById("res-score"), r.score, rush ? 200 : 1400);

    if (r.stars === 3 || best) {
      this.later(() => {
        GK.Sfx.closeUp();
        Fx.confetti(window.innerWidth, window.innerHeight,
          ["#e8467c", "#4aa3ff", "#ffd63d", "#5ec26a", "#ff8a3d"], 90);
      }, 1400);
    }
  },

  // The animation supplies the punch; it must never be the only thing that can
  // deliver the number. A backgrounded tab never advances rAF and the score
  // would sit frozen on whatever the first frame happened to compute.
  countUp(el, target, delay) {
    const dur = 900;
    const final = target.toLocaleString();
    setTimeout(() => {
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
        if (p < 1) requestAnimationFrame(step);
      };
      step();
    }, delay);
    setTimeout(() => { el.textContent = final; }, delay + dur + 80);
  },

  /* ---------------- the Corner Shop ---------------- */

  showShop() {
    this.progress = Storage.getProgress(this.profile.id);
    document.getElementById("shop-coins").textContent = Storage.coins(this.progress);

    document.getElementById("upgrade-list").innerHTML = UPGRADES.map((u) => {
      const lvl = upgradeLevel(this.progress, u.id);
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? 0 : u.costs[lvl];
      const afford = Storage.coins(this.progress) >= cost;
      const pips = u.costs.map((_, i) => (i < lvl ? "●" : "○")).join(" ");
      return `<div class="shop-item">
        <span class="si-icon">${u.icon}</span>
        <div class="si-text"><b>${u.name}</b><span class="si-pips">${pips}</span>
          <span class="si-desc">${u.desc}</span></div>
        <button class="btn small ${maxed || !afford ? "grey" : "green"}"
          ${maxed || !afford ? "disabled" : ""} onclick="App.buy('${u.id}')"
          aria-label="Buy ${u.name} for ${cost} coins">
          ${maxed ? "Done" : `🪙 ${cost}`}</button>
      </div>`;
    }).join("");

    document.getElementById("trim-count").textContent = `${trimCount(this.progress)} / ${TRIMS.length}`;
    document.getElementById("trim-grid").innerHTML = TRIMS.map((t) => {
      const owned = hasTrim(this.progress, t.id);
      const afford = Storage.coins(this.progress) >= t.cost;
      return `<button class="trim${owned ? " owned" : ""}"
        ${owned || !afford ? "disabled" : ""} onclick="App.buyTrim('${t.id}')"
        aria-label="${owned ? GK.util.esc(t.name) + ", owned" : `Buy ${GK.util.esc(t.name)} for ${t.cost} coins`}">
        <span class="tr-icon">${owned ? t.icon : "❔"}</span>
        <span class="tr-cost">${owned ? GK.util.esc(t.name) : `🪙 ${t.cost}`}</span></button>`;
    }).join("");

    GK.UI.showScreen("shop");
  },

  buy(id) {
    const res = Storage.buyUpgrade(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "All bought!");
    this.progress = res.progress;
    this.kit = upgradeLoadout(this.progress);
    GK.Sfx.purchase();
    GK.UI.toast("Bought! 🎉");
    this.showShop();
  },

  buyTrim(id) {
    const res = Storage.buyTrim(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "Already yours!");
    this.progress = res.progress;
    GK.Sfx.purchase();
    const def = TRIMS.find((t) => t.id === id);
    GK.UI.toast(`${def.icon} ${def.name} — up it goes!`);
    this.showShop();
  },

  /* ---------------- leaderboard & help ---------------- */

  showLeaderboard() {
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">⏱️ ${r.progress.rushScore || 0}</span>` +
        `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.rushScore || 0) - (a.progress.rushScore || 0),
      meId: this.profile && this.profile.id,
      empty: "No takings yet — play The Big Rush!",
    });
    GK.UI.showScreen("leaderboard");
  },

  showHelp() { GK.UI.closeModal("modal-pause"); GK.UI.openModal("modal-help"); },

  /* ---------------- the loop ---------------- */

  frame(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0);
    this.lastTs = ts;
    if (this.active) {
      // Pausing has to stop everything AROUND the simulation too — the effects,
      // the render clock, the fretting sound — not just Game.tick. One static
      // frame keeps the kitchen on screen instead of going blank.
      if (this.paused) {
        Render.render();
      } else {
        if (Game.running) Game.tick(dt);
        Render.update(dt);
        Fx.update(dt);
        Render.render();
        Fx.render(Render.ctx);
      }
    }
    GK.Debug.frame(dt);
    requestAnimationFrame((t) => this.frame(t));
  },
};

// Init on DOMContentLoaded, not inline at the bottom of <body>: a first render
// before layout settles resolves viewport-relative clamp() font sizes against
// the inherited value, and only the first screen comes out wrong.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();

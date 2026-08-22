// Cookie Crumble — screens, storage wiring and the frame loop.
//
// Everything that touches the DOM lives here. game.js decides what is true and
// emits events; this file makes a noise about them and writes them down.

// Every refusal the engine can hand back, in words a child can act on. The
// engine returns a code so it can be asserted on without pinning a sentence
// somebody will reword — and so the ones that just mean "nothing to do there"
// stay silent instead of nagging.
// Every refusal gets a word. A tap that does nothing and says nothing is what
// makes a game feel broken, and in a busy shift most taps are refusals.
const EXCUSES = {
  handsFull: "Your tray is full — serve something first!",
  emptyHanded: "You're not carrying anything yet.",
  taken: "Somebody's already at that table.",
  eating: "They're eating — let them enjoy it!",
  noPlate: "Nothing's ready at the pass yet.",
  notReady: "Their order isn't ready — put a bench on!",
  wrongDish: "That's not what they asked for.",
  nobodyWaiting: "Nobody's at the door just now.",
  nothingToDo: "Nothing to do there yet.",
  stationBusy: "That one's already going.",
  stationFull: "The pass is full — take some out first.",
  busy: "You've got enough lined up already.",
  alreadyOn: "You're already on your way there.",
};

// The four places she can be. One registry, so the bar cannot drift out of step
// with the screens it switches between.
const TABS = [
  { id: "map",         icon: "🫖", label: "Shifts",   go: "showMap" },
  { id: "shop",        icon: "🛒", label: "Shop",     go: "showShop" },
  { id: "album",       icon: "🦊", label: "Regulars", go: "showAlbum" },
  { id: "leaderboard", icon: "🏆", label: "Board",    go: "showLeaderboard" },
];

const App = {
  profile: null, progress: null, kit: null,
  active: false, paused: false, lastTs: 0, token: 0,
  _banked: 0, pendingShift: 0,

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
      avatars: ["🦉", "🦊", "🐰", "🐻", "🦔", "🐿️", "🐸", "🦡", "🐭", "🐱", "🌈", "👑"],
      meta: (p, prog) => `⭐ ${Storage.totalStars(prog)}/${SHIFTS.length * 3} · 🪙 ${Storage.coins(prog)}`,
      onEnter: (p) => this.enter(p),
      addLabel: "New Baker",
    });

    GK.initPWA({ appName: "Cookie Crumble" });
    GK.UI.bindSoundToggle(Storage);

    Storage.initFirebase().then((live) => {
      const b = document.getElementById("sync-badge");
      if (b) b.textContent = live ? "☁️ synced with the family" : "📴 this device only";
    });

    this.refreshSplash();

    GK.Debug.init({ storage: Storage, title: "COOKIE CRUMBLE" })
      .jump("shift", SHIFTS.length, (n) => { this.pendingShift = n - 1; this.confirmOpen(); })
      .action("+800 coins", () => { this.progress = Storage.addCoins(this.profile.id, 800); this.showMap(); })
      .action("the saturday rush", () => this.beginRun({ mode: "rush" }));

    requestAnimationFrame((ts) => this.frame(ts));
  },

  /* ---------------- splash & profiles ---------------- */

  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const btn = document.getElementById("btn-continue-as");
    if (!btn) return;
    if (last) {
      btn.style.display = "";
      btn.innerHTML = `${last.avatar} Back to the tearoom, ${GK.util.esc(last.name)}`;
      btn.onclick = () => GK.Profiles.select(last);
    } else btn.style.display = "none";
  },

  play() { GK.Profiles.renderList(); GK.UI.showScreen("profiles"); },

  enter(profile) {
    this.profile = profile;
    this.progress = Storage.getProgress(profile.id);
    this.kit = upgradeLoadout(this.progress);
    GK.Sfx.init();
    this.showMap();
  },

  /* ---------------- the shifts tab ---------------- */

  showMap() {
    this.progress = Storage.getProgress(this.profile.id);
    this.kit = upgradeLoadout(this.progress);
    const unlocked = Storage.unlockedShift(this.progress);

    document.getElementById("map-player").innerHTML =
      `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>` +
      `<span class="map-stats">⭐ ${Storage.totalStars(this.progress)} · 🪙 ${Storage.coins(this.progress)}</span>`;

    document.getElementById("hero").innerHTML = this.heroCard(unlocked);
    document.getElementById("rush-strip").innerHTML = this.rushStrip();

    document.getElementById("shift-list").innerHTML =
      WEEKS.map((week, wi) => this.weekRail(week, wi, unlocked)).join("");

    this.paintTabs("map");
    GK.UI.showScreen("map");
    this.drawHeroFaces();
    this.centreRails();
  },

  // Every tabbed screen paints the same bar, so there is no state to keep in
  // step between them — only which one is lit.
  paintTabs(active) {
    const html = TABS.map((t) => `<button class="tab${t.id === active ? " on" : ""}"
      ${t.id === active ? 'aria-current="page"' : ""} onclick="App.${t.go}()">
      <span class="t-ic">${t.icon}</span><span class="t-tx">${t.label}</span></button>`).join("");
    for (const bar of document.querySelectorAll(".tabbar")) bar.innerHTML = html;
  },

  // The card is a picture of THIS shift — today's guests and today's
  // tablecloths — rather than a stock illustration that never changes.
  heroCard(idx) {
    const s = SHIFTS[idx];
    const week = WEEKS[s.week];
    const room = ROOMS[s.room];
    const played = !!(this.progress.shifts || {})[idx];
    // Two seats, filled cyclically: an early shift lists only one type of guest,
    // and it really will be two regulars — not one regular and an empty chair.
    const faces = [0, 1].map((k) => GUEST[s.types[k % s.types.length]].animal);
    const cloths = room.cloths.slice(0, 3).map((c) => CLOTH[c].hex);

    return `<section class="hero">
      <div class="hero-scene" aria-hidden="true">
        ${[20, 80].map((x) => `<i class="hero-lamp" style="left:${x}%"></i>
          <i class="hero-shade" style="left:${x}%"></i>
          <i class="hero-pool" style="left:${x}%"></i>`).join("")}
        ${faces.map((a, k) => `<canvas class="hero-face" width="88" height="88"
          data-animal="${a}" style="left:${20 + k * 60}%"></canvas>`).join("")}
        ${cloths.map((hex, k) => `<i class="hero-tbl" style="left:${20 + k * 30}%;--c:${hex}"></i>`).join("")}
      </div>
      <div class="hero-body">
        <div class="hero-txt">
          <span class="hero-eyebrow">${played ? "Play again" : "Next shift"} · Week ${s.week + 1} · ${GK.util.esc(week.name)}</span>
          <b class="hero-name">${idx + 1}. ${GK.util.esc(s.name)}</b>
          <span class="hero-sub">${room.spots.length} tables · ${s.count} parties · ★ at ${s.target.toLocaleString()}</span>
        </div>
        <button class="btn hero-go" onclick="App.startShift(${idx})">${played ? "Again" : "Open up"}</button>
      </div>
    </section>`;
  },

  // Drawn with the same code the shift uses, so the guests on the card cannot
  // drift from the ones who actually walk through the door.
  drawHeroFaces() {
    for (const el of document.querySelectorAll(".hero-face")) {
      const c = el.getContext("2d");
      c.clearRect(0, 0, el.width, el.height);
      Render.ctx = c;
      Render.animal(c, el.width / 2, el.height / 2 + 3, el.width / 3, el.dataset.animal);
      Render.ctx = Render.cv.getContext("2d");
    }
  },

  rushStrip() {
    const open = Storage.rushUnlocked(this.progress);
    const best = this.progress.rushScore || 0;
    const line = !open ? `Pass ${RUSH_UNLOCK_SHIFTS} shifts to open up on Saturdays.`
      : best ? `Your best takings: ${best.toLocaleString()}`
      : "No closing time — how much can you take?";
    return `<button class="rush-strip"${open ? "" : " disabled"} onclick="App.startRush()"
      aria-label="Saturday Rush${open ? "" : ", locked"}">
      <span class="rs-ic">${open ? "⏱️" : "🔒"}</span>
      <span class="rs-tx"><b>Saturday Rush</b><i>${line}</i></span></button>`;
  },

  weekRail(week, wi, unlocked) {
    const rows = shiftsInWeek(wi);
    const shifts = this.progress.shifts || {};
    const got = rows.reduce((n, [, i]) => n + (shifts[i] ? shifts[i].stars : 0), 0);
    const done = rows.every(([, i]) => shifts[i]);
    const locked = rows.every(([, i]) => i > unlocked);
    return `<section class="rail${done ? " done" : ""}" style="--week:${week.hue}">
      <div class="rail-head">
        <i class="rail-bead"></i>
        <span class="rail-icon">${locked ? "🔒" : week.icon}</span>
        <h3>Week ${wi + 1} · ${GK.util.esc(week.name)}</h3>
        <span class="rail-count">${locked ? "locked" : `${got} of ${rows.length * 3} ★`}</span>
      </div>
      <div class="chips">${rows.map(([s, i]) => this.shiftChip(s, i, unlocked)).join("")}</div>
    </section>`;
  },

  shiftChip(s, i, unlocked) {
    const rec = (this.progress.shifts || {})[i];
    const locked = i > unlocked;
    const stars = rec ? rec.stars : 0;
    const pips = locked ? "🔒" : "★★★".slice(0, stars).padEnd(3, "☆");
    return `<button class="chip${locked ? " locked" : ""}${i === unlocked ? " next" : ""}${s.big ? " big" : ""}"
      ${locked ? "disabled" : ""} onclick="App.startShift(${i})"
      aria-label="Shift ${i + 1}, ${GK.util.esc(s.name)}${locked ? ", locked" : `, ${stars} stars`}">
      <span class="chip-num">${s.big ? "🎉" : i + 1}</span>
      <span class="chip-name">${GK.util.esc(s.name)}</span>
      <span class="chip-stars">${pips}</span></button>`;
  },

  // Bring each week to its most interesting chip WITHOUT touching the vertical
  // scroll — scrollIntoView would drag the hero off the top of the screen.
  centreRails() {
    for (const row of document.querySelectorAll(".chips")) {
      const mark = row.querySelector(".chip.next")
        || [...row.querySelectorAll(".chip:not(.locked)")].pop();
      if (!mark) continue;
      row.scrollLeft = Math.max(0, mark.offsetLeft - (row.clientWidth - mark.offsetWidth) / 2);
    }
  },

  /* ---------------- opening up ---------------- */

  startShift(idx) {
    this.pendingShift = idx;
    const s = SHIFTS[idx];
    document.getElementById("open-body").innerHTML =
      `<p class="sl-shift">Shift ${idx + 1} · <b>${GK.util.esc(s.name)}</b></p>` +
      `<div class="sl-group"><h4>On today</h4><div class="sl-items">` +
      s.dishes.map((d) => `<span class="sl-item">${DISH[d].name}</span>`).join("") + `</div></div>` +
      `<div class="sl-group"><h4>Expecting</h4><div class="sl-items">` +
      s.types.map((t) => `<span class="sl-item">${GK.util.esc(GUEST[t].name)}</span>`).join("") + `</div></div>` +
      `<p class="sl-tip">${GK.util.esc(s.tip || "Keep the benches going and nobody waits long.")}</p>` +
      `<p class="sl-crowd">👥 ${s.count} parties · ${ROOMS[s.room].spots.length} tables · one star at ${s.target}</p>`;
    GK.UI.openModal("modal-open");
  },

  confirmOpen() {
    GK.UI.closeModal("modal-open");
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
    Render.pops = []; Render.flash = {};
    Render.trims = (this.progress && this.progress.trims) || {};
    Game.start({ ...cfg, kit: this.kit });

    GK.UI.showScreen("game");
    this.updateHud();
    this.buildDock();
    Render.resize();
  },

  /* ---------------- input ---------------- */

  tap(z) {
    if (this.paused || !Game.running) return;
    const res = z.kind === "table" ? Game.tapTable(z.arg)
      : z.kind === "queue" ? Game.tapQueue(z.arg)
      : z.kind === "pass" ? Game.tapPass()
      : z.kind === "bin" ? Game.tapBin()
      : { ok: false, why: "unknown" };
    if (res.ok) { Render.hit1(z.key); GK.Sfx.pick(); return; }
    // Never swallow a tap. A refusal that neither moves nor makes a sound is
    // indistinguishable from a broken button, and in a busy shift most taps are
    // refusals.
    Render.bump(z.key);
    GK.Sfx.nope();
    const words = EXCUSES[res.why];
    if (words) GK.UI.toast(words);
  },

  cook(id) {
    if (this.paused || !Game.running) return;
    const res = Game.tapStation(id);
    if (!res.ok && EXCUSES[res.why]) GK.UI.toast(EXCUSES[res.why]);
  },

  buildDock() {
    document.getElementById("dock").innerHTML = STATIONS
      .filter((s) => (Array.isArray(s.makes) ? s.makes : [s.makes]).some((d) => Game.shift.dishes.includes(d)))
      .map((s) => `<button class="dockbtn" id="dock-${s.id}" onclick="App.cook('${s.id}')"
        aria-label="Start the ${s.name}"><span class="d-ic">${s.icon}</span>
        <span class="d-tx"><b>${s.name}</b><i id="dock-${s.id}-st">ready</i></span>
        <span class="d-bar"><i id="dock-${s.id}-bar"></i></span></button>`).join("");
  },

  updateDock() {
    for (const s of STATIONS) {
      const st = Game.stations[s.id];
      const el = document.getElementById(`dock-${s.id}`);
      if (!el || !st) continue;
      const txt = document.getElementById(`dock-${s.id}-st`);
      const bar = document.getElementById(`dock-${s.id}-bar`);
      const busy = st.busy, held = !!st.held;
      el.classList.toggle("busy", busy);
      el.classList.toggle("held", held);
      txt.textContent = held ? "pass full!" : busy ? DISH[st.makes].name : "ready";
      bar.style.width = busy ? `${Math.min(100, (st.t / st.dur) * 100)}%` : held ? "100%" : "0%";
    }
  },

  wireGame() {
    Game.on = {
      arrive: () => { GK.Sfx.doorbell(); this.updateHud(); },
      select: (d) => { if (d.party) GK.Sfx.pick(); },

      seated: (d) => {
        GK.Sfx.seat(d.match);
        const p = Render.centreOf(`t${d.table.i}`);
        if (d.match) { Render.pop(p.x, p.y - 40, "colour match!", "#ffe08a"); Fx.sparkle(0, 0, 0); }
      },
      ordered: () => GK.Sfx.order(),
      cookStart: (d) => { GK.Sfx.cook(d.station); this.updateDock(); },
      cookDone: (d) => { if (!d.held) GK.Sfx.ding(); this.updateDock(); },
      collected: () => GK.Sfx.lift(),

      servedDish: (d) => {
        GK.Sfx.serve();
        if (d.oneTrip) {
          GK.Sfx.oneTrip();
          const p = Render.centreOf(`t${d.table.i}`);
          Render.pop(p.x, p.y - 44, "all in one trip!", "#b8ffcb");
        }
      },

      paid: (d) => {
        GK.Sfx.paid(d.coins);
        const p = Render.centreOf(`t${d.table.i}`);
        Render.pop(p.x, p.y - 30, `🪙 ${d.coins}`, "#ffd45e");
        if (d.happy) Render.pop(p.x, p.y - 50, "happy!", "#b8ffcb");
        this.bankCoins();
        this.updateHud();
      },

      // A table that goes back to a "?" on its own is the one event the room
      // changes without her doing anything, so it has to announce itself —
      // otherwise the frog just quietly runs out of patience behind her.
      wantsMore: (d) => {
        GK.Sfx.doorbell();
        const p = Render.centreOf(`t${d.table.i}`);
        Render.pop(p.x, p.y - 40, "another, please!", "#ffe08a");
      },

      cleared: () => GK.Sfx.wipe(),
      stillDirty: () => { GK.Sfx.wipe(); GK.UI.toast("Crumbs everywhere — give it another wipe."); },
      refused: () => { GK.Sfx.nope(); GK.UI.toast("That's not what they ordered. 🙂"); },
      binned: () => GK.Sfx.bin(),
      cold: () => GK.Sfx.cold(),

      score: (d) => { if (d.chain >= 2 && d.kind !== "collect") GK.Sfx.chain(d.chain); this.updateHud(); },

      gaveUp: (d) => {
        GK.Sfx.gaveUp(); Fx.addShake(5);
        GK.UI.toast(GUEST[d.party.type].mustPlease
          ? "The inspector walked out. 😬"
          : "Somebody gave up waiting… 😕");
        this.updateHud();
      },

      shiftEnd: (r) => this.finishRun(r),
    };
  },

  /* ---------------- HUD ---------------- */

  updateHud() {
    const rush = Game.mode === "rush";
    document.getElementById("hud-shift").textContent = rush
      ? "⏱️ Saturday Rush" : `${Game.shiftIdx + 1}. ${SHIFTS[Game.shiftIdx].name}`;
    document.getElementById("hud-left").textContent = rush
      ? `😕 ${RUSH.mistakes - Game.lost}` : `👥 ${Math.max(0, Game.shift.count - Game.resolved())}`;
    document.getElementById("hud-lost").textContent = rush ? "" : `😕 ${Game.lost}/${Game.shift.maxLost}`;
    document.getElementById("hud-score").textContent = Game.score.toLocaleString();

    const bar = document.getElementById("star-fill");
    const t = Game.shift.target;
    if (rush || !isFinite(t)) { document.getElementById("star-track").style.display = "none"; }
    else {
      document.getElementById("star-track").style.display = "";
      bar.style.width = `${Math.min(100, (Game.score / (t * STAR_MULT[2])) * 100)}%`;
      const n = Game.stars();
      for (let k = 0; k < 3; k++)
        document.getElementById(`st${k}`).classList.toggle("on", k < n);
    }
  },

  bankCoins() {
    const d = Game.coins - this._banked;
    if (d > 0) { this._banked = Game.coins; this.progress = Storage.addCoins(this.profile.id, d); }
  },

  pause() { if (!Game.running) return; this.paused = true; GK.UI.openModal("modal-pause"); },
  resume() { this.paused = false; GK.UI.closeModal("modal-pause"); },
  quit() {
    this.paused = false; GK.UI.closeModal("modal-pause");
    this.token++;                 // any pending transition belongs to a run she left
    Game.abandon(); this.showMap();
  },

  // A delayed screen change captures the token and re-checks it, or quitting
  // inside the pause before the results screen yanks her out of the shifts tab and into
  // a shift she walked away from.
  later(fn, ms) { const t = this.token; setTimeout(() => { if (this.token === t) fn(); }, ms); },

  /* ---------------- results ---------------- */

  finishRun(r) {
    this.bankCoins();
    this.progress = Storage.recordShift(this.profile.id, r);
    this.kit = upgradeLoadout(this.progress);
    this.later(() => this.showResults(r), 700);
  },

  showResults(r) {
    const rush = r.mode === "rush";
    const best = rush && r.score >= (this.progress.rushScore || 0) && r.score > 0;

    document.getElementById("res-emoji").textContent =
      rush ? (best ? "🏆" : "⏱️") : ["😞", "🙂", "😄", "🥳"][r.stars];
    document.getElementById("res-title").textContent = rush
      ? (best ? "New best takings!" : "Closing time!")
      : r.inspectorLost ? "The inspector left unhappy."
      : r.win ? "Shift finished!" : "Too many walked out.";

    const se = document.getElementById("res-stars");
    se.innerHTML = ""; se.style.display = rush ? "none" : "";

    document.getElementById("res-score").textContent = "0";
    document.getElementById("res-served").textContent =
      `🧑 ${r.served} served${r.lost ? ` · ${r.lost} gave up` : ""}`;
    document.getElementById("res-extra").textContent =
      [r.bestChain >= 2 ? `🔥 best chain ${r.bestChain}` : "", r.wasted ? `🗑️ ${r.wasted} wasted` : ""]
        .filter(Boolean).join(" · ");
    document.getElementById("res-next-star").textContent =
      (!rush && r.win && r.stars < 3)
        ? `⭐ ${Math.round(r.target * STAR_MULT[r.stars]).toLocaleString()} points for ${r.stars + 1} stars.`
        : "";

    const nextIdx = r.shiftIdx + 1;
    const retry = document.getElementById("res-retry");
    const next = document.getElementById("res-next");
    if (rush) {
      retry.style.display = ""; retry.innerHTML = "⏱️ Again"; retry.onclick = () => this.startRush();
      next.style.display = "none";
    } else if (r.win && nextIdx < SHIFTS.length) {
      retry.style.display = ""; retry.innerHTML = "🔁 Replay"; retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = ""; next.innerHTML = "▶️ Next shift"; next.onclick = () => this.startShift(nextIdx);
    } else if (r.win) {
      retry.style.display = "none";
      next.style.display = ""; next.innerHTML = "⏱️ Try the Saturday Rush"; next.onclick = () => this.startRush();
    } else {
      retry.style.display = ""; retry.innerHTML = "🔁 Try again"; retry.onclick = () => this.startShift(r.shiftIdx);
      next.style.display = "none";
    }
    document.getElementById("res-finished").style.display =
      (!rush && r.win && nextIdx >= SHIFTS.length) ? "" : "none";

    GK.UI.showScreen("results");

    if (!rush) for (let i = 0; i < 3; i++) this.later(() => {
      const s = document.createElement("span");
      s.className = "res-star" + (i < r.stars ? " on" : "");
      s.textContent = i < r.stars ? "★" : "☆";
      se.appendChild(s);
      if (i < r.stars) GK.Sfx.star(i);
    }, 260 + i * 360);

    this.countUp(document.getElementById("res-score"), r.score, rush ? 200 : 1400);

    if (r.stars === 3 || best) this.later(() => {
      GK.Sfx.closeUp();
      Fx.confetti(window.innerWidth, window.innerHeight,
        ["#d9576f", "#2f8d86", "#c98d15", "#7f5fa4", "#3d84bd"], 90);
    }, 1400);
  },

  // The animation supplies the punch; it must never be the only thing that can
  // deliver the number. A backgrounded tab never advances rAF.
  countUp(el, target, delay) {
    const dur = 900, final = target.toLocaleString();
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

  /* ---------------- the shop ---------------- */

  showShop() {
    this.progress = Storage.getProgress(this.profile.id);
    document.getElementById("shop-coins").textContent = Storage.coins(this.progress);

    document.getElementById("upgrade-list").innerHTML = UPGRADES.map((u) => {
      const lvl = upgradeLevel(this.progress, u.id);
      const maxed = lvl >= u.costs.length;
      const cost = maxed ? 0 : u.costs[lvl];
      const afford = Storage.coins(this.progress) >= cost;
      const pips = u.costs.map((_, i) => (i < lvl ? "●" : "○")).join(" ");
      return `<div class="shop-item"><span class="si-icon">${u.icon}</span>
        <div class="si-text"><b>${u.name}</b><span class="si-pips">${pips}</span>
          <span class="si-desc">${u.desc}</span></div>
        <button class="btn small ${maxed || !afford ? "grey" : "green"}"
          ${maxed || !afford ? "disabled" : ""} onclick="App.buy('${u.id}')"
          aria-label="Buy ${u.name} for ${cost} coins">${maxed ? "Done" : `🪙 ${cost}`}</button></div>`;
    }).join("");

    document.getElementById("trim-count").textContent = `${trimCount(this.progress)} / ${TRIMS.length}`;
    document.getElementById("trim-grid").innerHTML = TRIMS.map((t) => {
      const owned = hasTrim(this.progress, t.id);
      const afford = Storage.coins(this.progress) >= t.cost;
      return `<button class="trim${owned ? " owned" : ""}" ${owned || !afford ? "disabled" : ""}
        onclick="App.buyTrim('${t.id}')"
        aria-label="${owned ? GK.util.esc(t.name) + ", already yours" : `Buy ${GK.util.esc(t.name)} for ${t.cost} coins`}">
        <span class="tr-icon">${owned ? t.icon : "❔"}</span>
        <span class="tr-cost">${owned ? GK.util.esc(t.name) : `🪙 ${t.cost}`}</span></button>`;
    }).join("");

    this.paintTabs("shop");
    GK.UI.showScreen("shop");
  },

  buy(id) {
    const res = Storage.buyUpgrade(this.profile.id, id);
    if (!res.ok) return GK.UI.toast(res.reason === "coins" ? "Not enough coins yet!" : "All bought!");
    this.progress = res.progress; this.kit = upgradeLoadout(this.progress);
    GK.Sfx.purchase(); GK.UI.toast("Bought! 🎉"); this.showShop();
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

  /* ---------------- the regulars ---------------- */

  showAlbum() {
    this.progress = Storage.getProgress(this.profile.id);
    const known = GUESTS.filter((g) => knowsGuest(this.progress, g.id)).length;
    document.getElementById("album-count").textContent = `${known} / ${GUESTS.length}`;
    document.getElementById("album-list").innerHTML = GUESTS.map((g) => {
      const n = metCount(this.progress, g.id);
      const know = n >= ALBUM_AT;
      return `<div class="regular${know ? " known" : ""}">
        <canvas class="reg-face" width="72" height="72" data-animal="${g.animal}"></canvas>
        <div class="reg-text">
          <b>${know ? GK.util.esc(g.name) : "???"}</b>
          <span class="reg-blurb">${know ? GK.util.esc(g.blurb) : `Serve ${ALBUM_AT - n} more to get to know them.`}</span>
          ${know ? `<span class="reg-breaks">${GK.util.esc(g.breaks)}</span>` : ""}
          <span class="reg-bar"><i style="width:${Math.min(100, (n / ALBUM_AT) * 100)}%"></i></span>
        </div></div>`;
    }).join("");
    this.paintTabs("album");
    GK.UI.showScreen("album");
    // The faces are drawn with the same code the game uses, so a regular in the
    // album cannot drift from the one who walks through the door.
    for (const el of document.querySelectorAll(".reg-face")) {
      const c = el.getContext("2d");
      c.clearRect(0, 0, 72, 72);
      Render.ctx = c; Render.animal(c, 36, 38, 24, el.dataset.animal); Render.ctx = Render.cv.getContext("2d");
    }
  },

  showLeaderboard() {
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">⏱️ ${r.progress.rushScore || 0}</span>` +
        `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>`,
      sort: (a, b) => (b.progress.rushScore || 0) - (a.progress.rushScore || 0),
      meId: this.profile && this.profile.id,
      empty: "No takings yet — play a Saturday Rush!",
    });
    this.paintTabs("leaderboard");
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
      // frame keeps the room on screen instead of going blank.
      if (this.paused) Render.render();
      else {
        if (Game.running) Game.tick(dt);
        Render.update(dt);
        Fx.update(dt);
        Render.render();
        Fx.render(Render.ctx);
        this.updateDock();
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

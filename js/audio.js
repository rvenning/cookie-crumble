// Cookie Crumble — sounds, all synthesized on top of gamekit's GK.Sfx.
//
// Two of these carry real information and have to be distinguishable with your
// eyes on something else: `ding` (a tray has just entered its green stripe) and
// `smoke` (it is going dark). They sit an octave apart with opposite pitch
// slides, so which one just happened is obvious without looking.
//
// And `nope` — the wrong plate handed back — is deliberately warm. It is a
// customer saying "not mine, love", never a buzzer.

Object.assign(GK.Sfx, {
  // Picking a tray up.
  lift() { this.tone({ freq: 400, type: "sine", dur: 0.06, vol: 0.14, slide: 110 }); },

  // Putting one down: a soft wooden knock.
  place() {
    this.tone({ freq: 190, type: "sine", dur: 0.07, vol: 0.15, slide: -40 });
    this.noise({ dur: 0.04, vol: 0.04 });
  },

  // The mixer, running. A low burr that resolves upward when the dough is ready.
  mixing() { this.tone({ freq: 130, type: "sawtooth", dur: 0.2, vol: 0.06, slide: 20 }); },
  doughReady() {
    this.tone({ freq: 480, type: "triangle", dur: 0.09, vol: 0.16 });
    this.tone({ freq: 640, type: "triangle", dur: 0.11, vol: 0.13, when: 0.08 });
  },

  // The cutter going through the dough.
  cut() {
    this.noise({ dur: 0.07, vol: 0.09 });
    this.tone({ freq: 300, type: "square", dur: 0.05, vol: 0.07, slide: -90 });
  },

  // Into the oven: the door, and the heat.
  ovenIn() {
    this.tone({ freq: 160, type: "sine", dur: 0.12, vol: 0.14, slide: -50 });
    this.noise({ dur: 0.18, vol: 0.05, when: 0.05 });
  },

  // The green stripe just opened. Bright and RISING.
  ding() {
    this.tone({ freq: 1240, type: "sine", dur: 0.34, vol: 0.19, slide: 90 });
    this.tone({ freq: 1860, type: "sine", dur: 0.26, vol: 0.08, when: 0.02 });
  },

  // Going dark. Low and FALLING — the opposite shape to the ding, on purpose.
  smoke() {
    this.tone({ freq: 420, type: "sawtooth", dur: 0.3, vol: 0.12, slide: -190 });
    this.noise({ dur: 0.26, vol: 0.07, when: 0.04 });
  },

  // Out of the oven, baked just right.
  perfect() {
    [0, 0.07, 0.15].forEach((t, i) =>
      this.tone({ freq: [700, 880, 1170][i], type: "triangle", dur: 0.11, vol: 0.16, when: t }));
  },

  // Out of the oven a bit dark. Not a failure sound — just a flatter version.
  crisp() { this.tone({ freq: 380, type: "triangle", dur: 0.16, vol: 0.13, slide: -60 }); },

  // Icing squeezed on.
  ice() { this.tone({ freq: 620, type: "sine", dur: 0.16, vol: 0.13, slide: 260 }); },

  // Sprinkles: a tiny scatter.
  sprinkle() {
    [0, 0.04, 0.08, 0.13].forEach((t) =>
      this.tone({ freq: 1400 + Math.random() * 700, type: "triangle", dur: 0.04, vol: 0.07, when: t }));
  },

  // Sold. The till, then the customer's little "ooh".
  sold(coins) {
    this.tone({ freq: 980, type: "square", dur: 0.05, vol: 0.13 });
    this.tone({ freq: 1470, type: "triangle", dur: 0.12, vol: 0.15, when: 0.05 });
    if (coins >= 20) this.tone({ freq: 1960, type: "sine", dur: 0.16, vol: 0.1, when: 0.13 });
  },

  // Wrong plate. Warm, low, apologetic — never a buzzer.
  nope() {
    this.tone({ freq: 250, type: "sine", dur: 0.1, vol: 0.14, slide: -45 });
    this.tone({ freq: 205, type: "sine", dur: 0.12, vol: 0.1, when: 0.1, slide: -25 });
  },

  // A new customer at the counter: the shop bell over the door.
  doorbell() {
    this.tone({ freq: 1560, type: "sine", dur: 0.16, vol: 0.11 });
    this.tone({ freq: 2080, type: "sine", dur: 0.2, vol: 0.06, when: 0.06 });
  },

  // Somebody gave up and left.
  leave() { this.tone({ freq: 330, type: "sine", dur: 0.24, vol: 0.13, slide: -150 }); },

  // Their patience is nearly out.
  fret() { this.tone({ freq: 700, type: "square", dur: 0.04, vol: 0.07 }); },

  // Into the bin.
  bin() { this.noise({ dur: 0.13, vol: 0.1 }); },

  // Scraping a wrong colour off.
  scrape() { this.noise({ dur: 0.18, vol: 0.07 }); this.tone({ freq: 220, type: "sawtooth", dur: 0.16, vol: 0.06, slide: 60 }); },

  // End of shift, one per star as they land.
  star(n) {
    this.tone({ freq: 660 * Math.pow(1.25, n), type: "triangle", dur: 0.22, vol: 0.2 });
    this.tone({ freq: 990 * Math.pow(1.25, n), type: "sine", dur: 0.3, vol: 0.1, when: 0.04 });
  },

  // Closing time, and it went well.
  closeUp() {
    [0, 0.11, 0.22, 0.36].forEach((t, i) =>
      this.tone({ freq: [523, 659, 784, 1047][i], type: "triangle", dur: 0.24, vol: 0.18, when: t }));
  },

  // Buying something from the Corner Shop.
  purchase() {
    this.tone({ freq: 880, type: "triangle", dur: 0.08, vol: 0.18 });
    this.tone({ freq: 1320, type: "triangle", dur: 0.14, vol: 0.14, when: 0.08 });
  },
});

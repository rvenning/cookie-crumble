// Cookie Crumble — sounds, all synthesized on top of gamekit's GK.Sfx.
//
// Two of these carry real information and have to be distinguishable with your
// eyes somewhere else: `ding` (something is ready at the pass) and `fret` (a
// guest is on their last heart). They sit an octave apart with opposite pitch
// slides, so which one just happened is obvious without looking.
//
// And `nope` is deliberately warm. It is a guest saying "that's not mine, love",
// never a buzzer.

Object.assign(GK.Sfx, {
  // The shop bell over the door.
  doorbell() {
    this.tone({ freq: 1560, type: "sine", dur: 0.16, vol: 0.11 });
    this.tone({ freq: 2080, type: "sine", dur: 0.2, vol: 0.06, when: 0.06 });
  },

  // Picking a guest out of the queue.
  pick() { this.tone({ freq: 520, type: "triangle", dur: 0.06, vol: 0.13, slide: 130 }); },

  // Showing them to a table. Two notes up for a colour match.
  seat(match) {
    this.tone({ freq: 480, type: "triangle", dur: 0.08, vol: 0.15 });
    if (match) {
      this.tone({ freq: 720, type: "triangle", dur: 0.1, vol: 0.15, when: 0.07 });
      this.tone({ freq: 960, type: "sine", dur: 0.14, vol: 0.1, when: 0.14 });
    }
  },

  // Taking an order — a little pencil scratch.
  order() { this.noise({ dur: 0.07, vol: 0.06 }); this.tone({ freq: 640, type: "square", dur: 0.05, vol: 0.07 }); },

  // A station going on.
  cook(station) {
    const f = station === "urn" ? 220 : station === "oven" ? 150 : 300;
    this.tone({ freq: f, type: "sawtooth", dur: 0.18, vol: 0.07, slide: 40 });
  },

  // Something is ready at the pass. Bright and RISING.
  ding() {
    this.tone({ freq: 1240, type: "sine", dur: 0.3, vol: 0.17, slide: 90 });
    this.tone({ freq: 1860, type: "sine", dur: 0.22, vol: 0.07, when: 0.02 });
  },

  // Plates onto the tray.
  lift() { this.tone({ freq: 400, type: "sine", dur: 0.06, vol: 0.13, slide: 110 }); },

  // Setting a plate down in front of somebody.
  serve() {
    this.tone({ freq: 300, type: "sine", dur: 0.07, vol: 0.14, slide: -60 });
    this.noise({ dur: 0.04, vol: 0.04, when: 0.03 });
  },

  // The whole order laid at once.
  oneTrip() {
    [0, 0.06, 0.13].forEach((t, i) =>
      this.tone({ freq: [700, 940, 1250][i], type: "triangle", dur: 0.1, vol: 0.15, when: t }));
  },

  // They settle up. The till, then a little "ooh" for a big one.
  paid(coins) {
    this.tone({ freq: 980, type: "square", dur: 0.05, vol: 0.12 });
    this.tone({ freq: 1470, type: "triangle", dur: 0.12, vol: 0.14, when: 0.05 });
    if (coins >= 30) this.tone({ freq: 1960, type: "sine", dur: 0.16, vol: 0.09, when: 0.13 });
  },

  // Wiping down. A soft brush.
  wipe() { this.noise({ dur: 0.14, vol: 0.06 }); },

  // Chain multiplier stepping up.
  chain(n) {
    const base = n >= 3 ? 760 : 600;
    [0, 0.05].forEach((t, i) => this.tone({ freq: base * Math.pow(1.26, i), type: "square", dur: 0.06, vol: 0.1, when: t }));
  },

  // The wrong plate, handed back. Warm, low, apologetic — never a buzzer.
  nope() {
    this.tone({ freq: 250, type: "sine", dur: 0.1, vol: 0.13, slide: -45 });
    this.tone({ freq: 205, type: "sine", dur: 0.12, vol: 0.09, when: 0.1, slide: -25 });
  },

  // Somebody is on their last heart. Low and FALLING — the opposite of the ding.
  fret() { this.tone({ freq: 620, type: "square", dur: 0.05, vol: 0.07, slide: -120 }); },

  // Somebody gave up and left.
  gaveUp() { this.tone({ freq: 330, type: "sine", dur: 0.24, vol: 0.13, slide: -150 }); },

  // Into the bin, and food gone cold.
  bin() { this.noise({ dur: 0.13, vol: 0.09 }); },
  cold() { this.tone({ freq: 380, type: "sine", dur: 0.18, vol: 0.07, slide: -110 }); },

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

  purchase() {
    this.tone({ freq: 880, type: "triangle", dur: 0.08, vol: 0.18 });
    this.tone({ freq: 1320, type: "triangle", dur: 0.14, vol: 0.14, when: 0.08 });
  },
});

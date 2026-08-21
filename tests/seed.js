// Seeds Math.random for the test sandbox. Loaded FIRST in any suite that runs
// the engine, so a failing balance assertion means a real tuning change rather
// than an unlucky shuffle of the order bag.
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  globalThis.__reseed = function (n) { Math.random = mulberry32(n >>> 0); };
  // The suite itself runs in Node's realm with a DIFFERENT, unseeded
  // Math.random. Every bit of randomness a bot makes up its own mind with has
  // to come back through here, or the same seed produces different mistakes.
  globalThis.__rand = function () { return Math.random(); };
  globalThis.__reseed(20260821);
})();

// fx.js - small helpers shared by the game: easing, colours, vibration and object pools.

const Ease = {
  clamp01: function (t) { return t < 0 ? 0 : t > 1 ? 1 : t; },
  outCubic: function (t) { t = Ease.clamp01(t); return 1 - Math.pow(1 - t, 3); },
  inOutQuad: function (t) { t = Ease.clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  // overshoots a little, which gives the size-up a springy "pop"
  outBack: function (t) {
    t = Ease.clamp01(t);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
};

// blend two "#rrggbb" colours; t = 0 gives a, t = 1 gives b
function mixColor(a, b, t) {
  t = Ease.clamp01(t);
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// Phone vibration. Needs the VIBRATE permission in the Android app (patch-android.js adds it).
const Haptics = {
  last: 0,
  buzz: function (pattern) {
    if (!Touch.enabled || !save.settings.haptics) return;
    const now = performance.now();
    if (now - this.last < 40) return;          // never spam the motor
    this.last = now;
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (error) { /* vibration is optional */ }
  }
};

// Re-using bullet and particle objects keeps the garbage collector quiet, which avoids stutter on phones.
const Pool = {
  bullets: [],
  particles: [],
  bullet: function () { return this.bullets.pop() || {}; },
  freeBullet: function (b) { if (this.bullets.length < 300) this.bullets.push(b); },
  particle: function () { return this.particles.pop() || {}; },
  freeParticle: function (p) { if (this.particles.length < 600) this.particles.push(p); }
};

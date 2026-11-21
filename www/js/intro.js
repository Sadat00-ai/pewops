// intro.js - the opening animation. It plays once when the app starts, then hands over to the lobby.
// Tap anywhere, press a key or use SKIP to jump straight to the lobby.

const Intro = {
  length: 4600,            // milliseconds until the lobby appears on its own
  timer: null,
  skip: null,

  shouldPlay: function () {
    const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return save.settings.intro !== false && save.settings.motion !== false && !calm;
  },

  play: function () {
    const el = document.getElementById("intro");
    if (!el || !this.shouldPlay()) {
      UI.show("menu");
      return;
    }
    const image = new Image();                  // warm up the lobby artwork while the intro plays
    image.src = "assets/operator-squad.svg";

    UI.show("intro");
    el.classList.remove("playing");
    void el.offsetWidth;                        // restart the CSS animation timeline
    el.classList.add("playing");

    this.skip = function (event) {
      if (event && event.type === "keydown" && event.repeat) return;
      Intro.finish(true);
    };
    el.addEventListener("pointerdown", this.skip);
    document.addEventListener("keydown", this.skip);
    this.timer = setTimeout(function () { Intro.finish(false); }, this.length);
  },

  finish: function (userSkipped) {
    const el = document.getElementById("intro");
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.skip) return;
    el.removeEventListener("pointerdown", this.skip);
    document.removeEventListener("keydown", this.skip);
    this.skip = null;
    el.classList.remove("playing");
    if (userSkipped) Sound.init();                // a tap counts as the first touch, so menu music can start
    if (UI.current === "intro") UI.show("menu");  // not if the player already moved on (Android back button)
  }
};

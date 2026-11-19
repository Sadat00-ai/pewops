// touch.js - on-screen controls for phones and tablets (twin-stick layout).
// Left side of the screen: move. Right side: aim, and the soldier fires while the stick is pushed.
// Buttons: grenade, reload, next weapon, pause.
// On desktop (mouse + keyboard) this file does nothing and Touch.enabled stays false.

const Touch = (function () {
  const params = new URLSearchParams(window.location.search);
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const enabled = !!window.Capacitor || coarse || params.get("touch") === "1";

  const api = {
    enabled: enabled,
    moveX: 0, moveY: 0, moveMag: 0,       // movement direction (unit vector) and strength 0..1
    aimAngle: -Math.PI / 2,               // last aim direction in radians
    aiming: false,                        // true while the aim stick is held
    firing: false,                        // true while the aim stick is pushed far enough
    sync: function () {},
    reset: function () {}
  };
  if (!enabled) return api;

  document.documentElement.classList.add("is-touch");

  // keep CSS in step with the real window size (Android bars, rotation, keyboard)
  function measure() {
    const root = document.documentElement.style;
    root.setProperty("--app-w", window.innerWidth + "px");
    root.setProperty("--app-h", window.innerHeight + "px");
  }
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  measure();

  // ---- build the controls ----
  const stage = document.getElementById("stage");
  const root = document.createElement("div");
  root.id = "touch-ui";
  root.hidden = true;
  root.innerHTML =
    '<div class="tzone tzone-move"></div>' +
    '<div class="tzone tzone-aim"></div>' +
    '<div class="tstick tstick-move"><i></i></div>' +
    '<div class="tstick tstick-aim"><i></i></div>' +
    '<button type="button" class="tbtn tbtn-grenade" data-t="grenade"><b>GRENADE</b></button>' +
    '<button type="button" class="tbtn tbtn-reload" data-t="reload"><b>RELOAD</b></button>' +
    '<button type="button" class="tbtn tbtn-weapon" data-t="weapon"><b>SWAP</b></button>' +
    '<button type="button" class="tbtn tbtn-pause" data-t="pause" aria-label="Pause"><span></span><span></span></button>';
  stage.appendChild(root);

  // ---- floating stick: appears wherever the thumb lands inside its zone ----
  function makeStick(zone, stick, onChange) {
    const knob = stick.firstElementChild;
    let pointerId = null;
    let ox = 0;
    let oy = 0;

    function radius() { return stick.offsetWidth * 0.5; }

    function update(event) {
      const r = radius();
      let dx = event.clientX - ox;
      let dy = event.clientY - oy;
      const dist = Math.hypot(dx, dy);
      if (dist > r) { dx = dx / dist * r; dy = dy / dist * r; }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      onChange(dx / r, dy / r, true);
    }

    function release() {
      pointerId = null;
      stick.classList.remove("active");
      stick.style.left = "";
      stick.style.top = "";
      knob.style.transform = "";
      onChange(0, 0, false);
    }

    zone.addEventListener("pointerdown", function (event) {
      if (pointerId !== null) return;
      pointerId = event.pointerId;
      try { zone.setPointerCapture(pointerId); } catch (error) { /* some WebViews refuse capture */ }
      ox = event.clientX;
      oy = event.clientY;
      const r = radius();
      stick.style.left = Math.max(0, ox - r) + "px";
      stick.style.top = Math.max(0, oy - r) + "px";
      stick.classList.add("active");
      update(event);
      event.preventDefault();
    });
    zone.addEventListener("pointermove", function (event) {
      if (event.pointerId === pointerId) { update(event); event.preventDefault(); }
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) {
      zone.addEventListener(name, function (event) {
        if (event.pointerId === pointerId) release();
      });
    });
    return release;
  }

  const releaseMove = makeStick(root.querySelector(".tzone-move"), root.querySelector(".tstick-move"), function (x, y, down) {
    const mag = Math.hypot(x, y);
    const dead = 0.12;
    api.moveMag = !down || mag < dead ? 0 : Math.min(1, (mag - dead) / 0.6);
    api.moveX = mag > 0 ? x / mag : 0;
    api.moveY = mag > 0 ? y / mag : 0;
  });

  const releaseAim = makeStick(root.querySelector(".tzone-aim"), root.querySelector(".tstick-aim"), function (x, y, down) {
    const mag = Math.hypot(x, y);
    api.aiming = down && mag > 0.12;
    if (api.aiming) api.aimAngle = Math.atan2(y, x);
    api.firing = down && mag > 0.35;
  });

  // ---- buttons ----
  const actions = {
    grenade: function () { throwGrenade(); },
    reload: function () { if (G && !G.player.dead) startReload(); },
    weapon: function () { cycleWeapon(); },
    pause: function () { pauseGame(); }
  };
  root.querySelectorAll(".tbtn").forEach(function (button) {
    button.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (state !== "playing" || !G) return;
      button.classList.add("pressed");
      actions[button.dataset.t]();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
      button.addEventListener(name, function () { button.classList.remove("pressed"); });
    });
  });

  // ---- show only while a mission is running ----
  let shown = false;
  api.reset = function () {
    releaseMove();
    releaseAim();
    api.moveMag = 0;
    api.aiming = false;
    api.firing = false;
  };
  api.sync = function () {
    const on = state === "playing";
    if (on === shown) return;
    shown = on;
    root.hidden = !on;
    if (!on) api.reset();
  };

  // block the long-press menu and pinch-zoom everywhere except text fields
  document.addEventListener("contextmenu", function (event) {
    if (!event.target.closest("input")) event.preventDefault();
  });
  document.addEventListener("gesturestart", function (event) { event.preventDefault(); });

  return api;
})();

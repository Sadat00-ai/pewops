// main.js - starts everything once the page has loaded

UI.init();
requestAnimationFrame(function (now) {
  lastTime = now;
  loop(now);
});

// Android back button: pause / resume in a mission, go back through menus, exit from the main menu.
let lastBack = 0;
function handleBack() {
  const now = Date.now();
  if (now - lastBack < 300) return;          // a single press can arrive twice
  lastBack = now;

  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
  else if (state === "levelcomplete" || state === "victory" || state === "gameover") quitToMenu();
  else if (UI.current !== "menu") UI.show("menu");
  else {
    const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (app && app.exitApp) app.exitApp();
  }
}
document.addEventListener("backbutton", handleBack);
(function () {
  const app = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (app && app.addListener) app.addListener("backButton", handleBack);
})();

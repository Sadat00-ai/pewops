# PewOps Android edition

## 2.2.0 (Android)
- Added twin-stick touch controls (move / aim+auto-fire, grenade, reload, swap weapon, pause) in `www/js/touch.js`.
- Landscape phone layouts: compact menus, scrollable inner pages, larger HUD, rotate-your-phone hint in portrait.
- Android back button: pause / resume / go back / exit.
- Added Capacitor project, icons, splash, one-command build script and GitHub Actions workflow.
- Fix: grenade throw distance and particle speed depended on frame rate (wrong on 90/120 Hz phones) — now time-based.
- Fix: audio is woken up again after the app returns from the background.
- Fix: mission-complete +100 XP could be farmed by replaying a mission — now first clear only.
- Fix: `roundRect` fallback for older Android WebViews (HUD would not draw on them).
- Fix: Time Attack / Training Arena links were hidden on short phone screens.
- Game now also pauses when the page becomes hidden (not only on window blur).
- Credits: "Created by SM Sadat" on the lobby footer and Settings.

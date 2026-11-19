# PewOps Android edition

## 2.3.0 (Power Surge update)
**Gameplay**
- **Power Surge:** kills charge a meter. When it is full, tap POWER (or press Q / Space) to grow up to 40% bigger for about 12 seconds: +50% damage, +20% fire rate, 30% less damage taken, a speed boost, piercing bullets and a small heal on every kill. Starting a Surge sends out a shockwave that hurts nearby enemies and clears enemy bullets. Kills during a Surge extend it.
- **Last Stand:** with a full meter, a fatal hit triggers the Surge automatically and you survive. Kills while on low health charge the meter twice as fast.
- **Power cores:** five glowing pick-ups spawn on the map or drop from enemies: Damage and Speed (3 levels each), Shield, Magnet and Surge.
- **Shield bar**, plus **0.5 s of invulnerability after every hit** (you blink while it lasts).
- **Dedicated FIRE button** on phones: hold it to shoot; with no aim stick held it turns toward the nearest enemy. The ring on it shows your magazine and refills while reloading. Stick auto-fire can be turned off in Settings.
- **Dash** (SHIFT / DASH button): quick dodge with brief invulnerability and a 2 second cooldown.
- **Precise movement:** speed now ramps up and down in about a tenth of a second, analog stick strength is respected, and there are a ground ring, a movement chevron, dust and (on phones) a gentle aim assist.
- **Smarter enemies:** flankers swing wide, wounded shooters duck behind cover, and enemies wander while you respawn.
- **Bosses** now have three phases (new attack patterns, reinforcements, faster fire) and a big health bar.
- **Credits and upgrades:** earn credits from kills and missions, then spend them in the new Upgrade Bay on operator and per-weapon upgrades.
- **Daily missions and 11 medals** that pay credits.

**Look and feel**
- Brand-new lobby: one big DEPLOY button, today's mission, mode tiles and a bottom navigation bar. Animations only use transform/opacity so they stay smooth and battery-friendly, and can be turned off.
- Muzzle-flash cones, ejected shell casings, hit-stop on heavy kills, a slow-motion beat when a Surge starts, drifting parallax dust and a smooth grow/shrink transition with aura and rings.
- Separate menu, combat and boss music; new sound effects.
- Haptic feedback on phones (shots, hits, dash, Surge).
- First-time tutorial card.

**Technical**
- Frame-rate lock (30 / 60 / max) for battery saving, and the game stops drawing while in menus.
- Object pooling for bullets and particles.
- On-screen button size setting (S / M / L) and safe-area padding for notches.
- Volume sliders in the pause menu.
- The Android build now adds the VIBRATE permission.
- Saves from 2.2 load unchanged; new fields get defaults.

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

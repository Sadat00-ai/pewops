# PewOps feature checklist (v2.3.0)

Status of the "2D Android shooting game" checklist.

| Area | Item | Status |
|---|---|---|
| Core | Movement, aiming, boundaries | Done (smooth acceleration, dash) |
| Core | Health, shield, damage and death | Done (shield bar added) |
| Core | Invulnerability frames after a hit | Done (0.5 s) |
| Core | Respawn / game over | Done |
| Core | Scoring, combos, high score | Done |
| Weapons | Weapon switching, bullets, fire rate, ammo and reload | Done |
| Weapons | Weapon stats and upgrades | Done (Upgrade Bay: damage, magazine, fire rate) |
| Weapons | Pierce | Done (during Power Surge) |
| Weapons | Hitscan / raycast, burst modes, melee | Not added (the game's bullets are fast enough; see notes) |
| Enemies | Waves, enemy types, AI | Done (flanking, cover-seeking, wandering) |
| Enemies | Boss battles | Done (three phases, boss health bar) |
| Enemies | Loot | Done (health, ammo, credits, power cores) |
| Touch | Thumbsticks, buttons, haptics | Done |
| Touch | Resizable HUD | Done (button size S / M / L). Moving buttons is not supported. |
| UI | Menus, HUD, pause, results, shop, tutorial | Done |
| Look | Casings, muzzle flash, particles, shake, hit-stop, parallax dust | Done |
| Audio | Separate menu / combat / boss music and effects | Done |
| Progress | Levels, endless mode, credits, medals, daily missions, local save | Done |
| Progress | Skins with different stats | Cosmetic uniforms only |
| Android | Object pooling, 30/60 FPS lock, safe areas, signed AAB/APK | Done |
| Android | Sprite atlases / texture compression | Not needed (art is drawn in code) |
| Android | Google Play Services, ads, in-app purchases | Not added on purpose (the store listing promises no ads and no purchases) |

## Power Surge rules (for balancing)
- Meter gain per kill: grunt 8, runner 8, sniper 12, heavy 15, boss 40. Doubled on low health, plus 10% per Power Cells level.
- Surge lasts 12 s (up to 16 s with kills). Size x1.4, hitbox x1.25, damage x1.5, fire rate x1.2, damage taken x0.7, speed x1.1.
- Dash: 0.18 s, 2 s cooldown, 0.3 s invulnerability.
- Credits: 2-6 per enemy (boss 60) plus a mission bonus of 40 + 5 per mission (half on replays).

## How this was tested
The game logic, every menu screen and the touch layout were run in a real Chromium browser (desktop and phone-sized screens): Surge, Last Stand, cores, shield, dash, boss phases, pooling, saves from 2.2, shop, daily missions, settings and button overlap checks. The Android build itself is verified by the GitHub Actions workflow on this branch.

# How to get the PewOps APK and test it

You do NOT need to know Android programming. Pick ONE route.

## Route A — GitHub builds it for you (nothing to install except a free account)
1. Create a free account at github.com and make a new **private** repository (e.g. `pewops`).
2. Upload everything in this folder (drag & drop works: *Add file → Upload files*). Keep the `.github` folder.
3. Open the **Actions** tab → **Build PewOps APK** → wait about 5–8 minutes for the green tick.
4. Open the finished run → **Artifacts → PewOps-APK** → download, unzip → `PewOps-2.2.0-debug.apk`.
5. If it fails, open the red run, copy the last 30 lines of the log and send them to me.

## Route B — Build on your own PC
Install once:
1. **Node.js 22 LTS** — nodejs.org
2. **Android Studio** — developer.android.com/studio. Open it once and finish the setup wizard (it downloads the Android SDK and Java).

Then, in this folder:
- Windows: double-click **build-apk.bat**
- Mac/Linux: run `./build-apk.sh`

The first build takes 5–15 minutes (downloads). The APK appears in `dist/PewOps-2.2.0-debug.apk`.

## Testing on your phone (best)
1. Copy the APK to the phone (USB, Telegram, Drive…) and tap it.
2. Allow *Install unknown apps* for the app you opened it from, then Install.
   (Play Protect may say "unrecognised developer" — normal for apps not from the Play Store → *Install anyway*.)
3. Check: launches in landscape, fullscreen; sticks work; sound plays after first tap; Back button pauses; progress is kept after closing the app.

Via USB cable instead: enable *Developer options → USB debugging*, then `adb install -r dist/PewOps-2.2.0-debug.apk`.

## Testing without a phone
Android Studio → *More Actions → Virtual Device Manager* → create a Pixel phone (API 34+) → run the APK by dragging it onto the emulator. Needs ~8 GB RAM.

## Quick browser test (no Android at all)
`npm run serve`, open http://localhost:8080/?touch=1 in Chrome, press F12 → device toolbar (Ctrl+Shift+M), choose a phone and rotate to landscape.

## Changing things
- App name / package ID: `capacitor.config.json` (changing the package ID later makes it a different app).
- Version: `package.json` → `version`.
- Game files: everything in `www/`. Rebuild after any change.
- Icons / splash: `resources/android/` (and `store/` for store graphics). Text for the store page: `STORE_LISTING.md`.

## Publishing later (Google Play)
The debug APK is perfect for testing and sharing with friends. Google Play needs a signed *release* bundle (.aab) with your own keystore and a $25 one-time developer account. Tell me when you're ready and I'll add the signing step.

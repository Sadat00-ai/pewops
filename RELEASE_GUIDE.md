# Publishing PewOps on Google Play — step by step

## 0. Before you start (one time)
1. Make a Google Play developer account (play.google.com/console, one-time $25 fee, identity verification).
   New personal accounts usually must run a **closed test with at least 12 testers for 14 days** before production — check "Testing requirements" in the Console.
2. Contact email in `docs/index.html` is already set (sadatrahi008@gmail.com); change it there if you want a different one.
3. Turn on the privacy-policy page: GitHub repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/docs` → Save.
   Your policy URL will be `https://sadat00-ai.github.io/pewops/` — paste it into Play Console → App content → Privacy policy.

## 1. Create your signing key (ONE time — back it up!)
You need Java installed (Android Studio includes it). In a terminal:

```
keytool -genkeypair -v -keystore pewops-release.keystore -alias pewops -keyalg RSA -keysize 2048 -validity 10000
```
Answer the questions and choose a strong password. **Keep `pewops-release.keystore` and the passwords somewhere safe (cloud drive + USB). If you lose it you cannot update the app the normal way. Never put it in the repository or send it to anyone.**

Convert it to text for GitHub:
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("pewops-release.keystore")) | Set-Clipboard`
- Mac/Linux: `base64 -w0 pewops-release.keystore`

## 2. Add 4 secrets to GitHub
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `KEYSTORE_BASE64` | the long base64 text from above |
| `KEYSTORE_PASSWORD` | the keystore password |
| `KEY_ALIAS` | `pewops` (what you typed after `-alias`) |
| `KEY_PASSWORD` | the key password (same as the keystore password if you pressed Enter) |

## 3. Build the signed files
Actions tab → **Build signed release (Play Store)** → **Run workflow**. When it turns green, download artifact **PewOps-release**:
- `PewOps-2.2.0-release.aab` → upload this to Google Play
- `PewOps-2.2.0-release.apk` → signed APK for sharing directly (WhatsApp, website…)

For every new update: raise `version` in `package.json` (e.g. 2.2.1) — Google rejects an upload whose version number is not higher than the last one.

## 4. Play Console checklist
Create app → *Game*, *Free*. Then:
- **Store listing**: copy text from `STORE_LISTING.md`; icon `store/icon-512.png`; feature graphic `store/feature-graphic-1024x500.png`; screenshots `store/screenshots/` (min. 2).
- **App content**: Privacy policy URL · Ads: **No, my app does not contain ads** (change if you add AdMob) · App access: all functionality available without login · Target audience: **13+ / 18+ is safest for a shooter** (do not choose "children") · News app: No · Government app: No.
- **Content rating** questionnaire: shooter/violence = *cartoon/fantasy violence*, no blood, no gambling, no user-to-user interaction, no purchases.
- **Data safety**: *No data collected, no data shared*; no data transferred off device (the app has no internet use). Data deletion: not applicable (data stays on device).
- **Release**: Testing → Closed testing → create release → upload the `.aab` → add testers (email list) → after the required days apply for Production.
- Let Google handle app signing (**Play App Signing**, default) — your keystore becomes the *upload key*.

## 5. Later: earning money
Ads (AdMob) or "remove ads" purchase need extra code plus changes to the privacy policy, Data safety and Ads answers above. Ask me when you reach this step.

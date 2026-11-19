// build.js - one command to turn the game in www/ into an installable Android APK.
//   node scripts/build.js            -> builds dist/PewOps-<version>-debug.apk
//   node scripts/build.js --sync-only -> only copies the game into the Android project
// Works on Windows, macOS and Linux. Needs: Node 22+, JDK 21 (comes with Android Studio) and the Android SDK.

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");
const isWin = process.platform === "win32";
const syncOnly = process.argv.includes("--sync-only");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function step(text) { console.log("\n=== " + text + " ==="); }
function fail(text) { console.error("\nERROR: " + text + "\n"); process.exit(1); }

function run(cmd, args, cwd, env) {
  console.log("> " + cmd + " " + args.join(" "));
  const result = spawnSync(cmd, args, { cwd: cwd || root, stdio: "inherit", shell: isWin, env: Object.assign({}, process.env, env || {}) });
  if (result.status !== 0) fail("Command failed: " + cmd + " " + args.join(" "));
}

// ---- Node version ----
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) fail("Node.js 22 or newer is required (you have " + process.versions.node + "). Download the LTS from https://nodejs.org");

// ---- dependencies ----
step("1/5 Installing JavaScript dependencies");
run("npm", ["install", "--no-audit", "--no-fund"]);

// ---- Android project ----
step("2/5 Creating the Android project (first run only)");
if (!fs.existsSync(androidDir)) run("npx", ["cap", "add", "android"]);
else console.log("android/ already exists - reusing it");

step("3/5 Applying PewOps settings (landscape, fullscreen, icons, splash)");
run("node", [path.join("scripts", "patch-android.js")]);
run("npx", ["cap", "sync", "android"]);

if (syncOnly) { console.log("\nGame files copied into android/. Open it with: npx cap open android"); process.exit(0); }

// ---- find the Android SDK ----
step("4/5 Locating Android SDK and Java");
function firstExisting(list) { return list.find(function (p) { return p && fs.existsSync(p); }); }

let sdk = firstExisting([process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]);
if (!sdk) {
  sdk = firstExisting([
    isWin ? path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk") : null,
    path.join(os.homedir(), "Library", "Android", "sdk"),
    path.join(os.homedir(), "Android", "Sdk")
  ]);
}
if (!sdk) fail("Android SDK not found.\nInstall Android Studio (https://developer.android.com/studio), open it once so it downloads the SDK, then run this again.\nOr set the ANDROID_HOME environment variable to your SDK folder.");
console.log("Android SDK: " + sdk);
fs.writeFileSync(path.join(androidDir, "local.properties"), "sdk.dir=" + sdk.replace(/\\/g, "\\\\") + "\n");

const env = {};
if (!process.env.JAVA_HOME) {
  const jbr = firstExisting([
    isWin ? "C:\\Program Files\\Android\\Android Studio\\jbr" : null,
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    "/opt/android-studio/jbr",
    path.join(os.homedir(), "android-studio", "jbr")
  ]);
  if (jbr) { env.JAVA_HOME = jbr; console.log("Using Android Studio's Java: " + jbr); }
}

// ---- build ----
step("5/5 Building the APK (the first build downloads Gradle and takes several minutes)");
const gradlew = isWin ? "gradlew.bat" : "./gradlew";
if (!isWin) { try { fs.chmodSync(path.join(androidDir, "gradlew"), 0o755); } catch (error) { /* ignore */ } }
run(gradlew, ["assembleDebug"], androidDir, env);

const built = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
if (!fs.existsSync(built)) fail("Build finished but the APK was not found at " + built);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const target = path.join(root, "dist", "PewOps-" + pkg.version + "-debug.apk");
fs.copyFileSync(built, target);

console.log("\n==============================================");
console.log(" DONE!  Your APK is here:");
console.log("   " + target);
console.log(" Copy it to your phone and tap it to install.");
console.log("==============================================\n");

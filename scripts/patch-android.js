// patch-android.js - customises the freshly generated Capacitor Android project:
//   landscape lock, fullscreen/immersive mode, notch support, app icons, splash, version numbers.
// Safe to run many times. Run automatically by scripts/build.js.

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");
const resSrc = path.join(root, "resources", "android");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const mainDir = path.join(androidDir, "app", "src", "main");
const resDir = path.join(mainDir, "res");
const done = [];
const skipped = [];

function walk(dir, test, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, test, out);
    else if (test(full)) out.push(full);
  }
  return out;
}

if (!fs.existsSync(androidDir)) {
  console.error("No android/ folder yet. Run: npx cap add android");
  process.exit(1);
}

// 1) AndroidManifest: lock to landscape (either direction)
(function () {
  const file = path.join(mainDir, "AndroidManifest.xml");
  if (!fs.existsSync(file)) return skipped.push("AndroidManifest.xml not found");
  let xml = fs.readFileSync(file, "utf8");
  if (!/android:screenOrientation=/.test(xml)) {
    xml = xml.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
    fs.writeFileSync(file, xml);
  }
  done.push("landscape orientation lock");

  // vibration (haptics) needs this permission; it is a normal permission, so Android never asks the player
  xml = fs.readFileSync(file, "utf8");
  if (!/android\.permission\.VIBRATE/.test(xml)) {
    xml = xml.replace("</manifest>", '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>');
    fs.writeFileSync(file, xml);
  }
  done.push("vibrate permission (haptics)");
})();

// 2) MainActivity: fullscreen immersive mode, keep screen awake, draw into the notch area
(function () {
  const files = walk(path.join(mainDir, "java"), function (f) { return /MainActivity\.(java|kt)$/.test(f); });
  if (!files.length) return skipped.push("MainActivity not found");
  const file = files[0];
  const src = fs.readFileSync(file, "utf8");
  const pkgMatch = src.match(/^\s*package\s+([\w.]+)/m);
  const pkgName = pkgMatch ? pkgMatch[1] : cfg.appId;

  const java = `package ${pkgName};

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

// PewOps: fullscreen game window (written by scripts/patch-android.js)
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        enterImmersive();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersive();
    }

    private void enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
}
`;

  const kotlin = `package ${pkgName}

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.BridgeActivity

// PewOps: fullscreen game window (written by scripts/patch-android.js)
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            val lp = window.attributes
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            window.attributes = lp
        }
        enterImmersive()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    private fun enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
}
`;
  fs.writeFileSync(file, file.endsWith(".kt") ? kotlin : java);
  done.push("fullscreen + notch + keep-awake (" + path.basename(file) + ")");
})();

// 3) Version number
(function () {
  const candidates = [path.join(androidDir, "app", "build.gradle"), path.join(androidDir, "app", "build.gradle.kts")];
  const file = candidates.find(fs.existsSync);
  if (!file) return skipped.push("app/build.gradle not found");
  const parts = pkg.version.split(".").map(Number);
  const code = (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  let text = fs.readFileSync(file, "utf8");
  text = text.replace(/versionCode(\s*=)?\s*\d+/, function (m, eq) { return "versionCode" + (eq ? " = " : " ") + code; });
  text = text.replace(/versionName(\s*=)?\s*"[^"]*"/, function (m, eq) { return "versionName" + (eq ? " = " : " ") + '"' + pkg.version + '"'; });
  fs.writeFileSync(file, text);
  done.push("version " + pkg.version + " (code " + code + ")");
})();

// 4) Launcher icons
(function () {
  let count = 0;
  for (const dens of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
    const from = path.join(resSrc, "mipmap-" + dens);
    const to = path.join(resDir, "mipmap-" + dens);
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      fs.copyFileSync(path.join(from, name), path.join(to, name));
      count++;
    }
  }
  const valuesDir = path.join(resDir, "values");
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(path.join(valuesDir, "ic_launcher_background.xml"),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E1712</color>\n</resources>\n');
  // adaptive icon (Android 8+): our PNG foreground on the dark background colour
  const adaptive = path.join(resDir, "mipmap-anydpi-v26");
  fs.mkdirSync(adaptive, { recursive: true });
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <background android:drawable="@color/ic_launcher_background"/>\n' +
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n';
  fs.writeFileSync(path.join(adaptive, "ic_launcher.xml"), xml);
  fs.writeFileSync(path.join(adaptive, "ic_launcher_round.xml"), xml);
  done.push("launcher icons (" + count + " files)");
})();

// 5) Splash screens
(function () {
  const splashes = walk(resDir, function (f) { return path.basename(f) === "splash.png"; });
  splashes.forEach(function (file) {
    const port = /drawable-port/.test(file);
    const from = path.join(resSrc, port ? "splash-port.png" : "splash-land.png");
    if (fs.existsSync(from)) fs.copyFileSync(from, file);
  });
  done.push("splash screens (" + splashes.length + ")");
})();

console.log("\nPatched Android project:");
done.forEach(function (d) { console.log("  OK   " + d); });
skipped.forEach(function (d) { console.log("  SKIP " + d); });

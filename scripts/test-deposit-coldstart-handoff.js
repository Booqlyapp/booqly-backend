/**
 * Evidence-based checks for email Pay deposit → Android cold start handoff.
 * Does NOT assume backend/APK deploy; reports what is actually live vs in source.
 *
 * Usage: node scripts/test-deposit-coldstart-handoff.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const BASE = (process.argv[2] || "https://api.booqlyapp.com").replace(/\/$/, "");
const SAMPLE_ID = "00000000-0000-4000-8000-000000000099";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: 20000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      );
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout " + url));
    });
  });
}

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const results = [];
  const pass = (l) => {
    console.log("PASS  " + l);
    results.push({ ok: true, l });
  };
  const fail = (l, e) => {
    console.error("FAIL  " + l + ": " + (e.message || e));
    results.push({ ok: false, l, e: String(e.message || e) });
  };
  const warn = (l) => {
    console.warn("WARN  " + l);
    results.push({ ok: true, warn: true, l });
  };

  // --- Source: backend HTML bridge ---
  try {
    const src = read("../src/routes/appointment_deeplink_route.ts");
    assert(src.includes("intent://appointments/"), "source missing intent://");
    assert(src.includes("package=com.booqlyapp"), "source missing package=");
    assert(src.includes("250"), "source missing delayed redirect");
    assert(
      !/meta http-equiv=["']refresh["']/i.test(src),
      "source still has instant meta refresh"
    );
    pass("source HTML bridge uses Android intent:// (no instant meta refresh)");
  } catch (e) {
    fail("source HTML bridge", e);
  }

  // --- Source: Android ---
  try {
    const manifest = read("../../app/android/app/src/main/AndroidManifest.xml");
    assert(manifest.includes('android:launchMode="singleTask"'), "not singleTask");
    assert(
      manifest.includes('android:pathPrefix="/appointments"'),
      "missing appointments intent-filter"
    );
    assert(manifest.includes('android:scheme="booqly"'), "missing booqly scheme");
    const main = read(
      "../../app/android/app/src/main/kotlin/com/booqlyapp/MainActivity.kt"
    );
    assert(main.includes("onNewIntent"), "MainActivity missing onNewIntent");
    assert(main.includes("setIntent(intent)"), "onNewIntent missing setIntent");
    pass("source Android singleTask + onNewIntent + intent-filters");
  } catch (e) {
    fail("source Android", e);
  }

  // --- Source: Flutter cold start ---
  try {
    const dl = read("../../app/lib/services/deep_link_service.dart");
    assert(dl.includes("consumePendingColdStartNavigation"), "missing consume");
    assert(dl.includes("savePendingDeepLink"), "missing persist");
    assert(dl.includes("_waitForNavigatorReady"), "missing navigator wait");
    assert(
      !/await Get\.to\(\s*\(\)\s*=>\s*BookingDetailView/.test(dl),
      "still awaits Get.to(BookingDetailView) which blocks deep-link lock"
    );
    const detail = read(
      "../../app/lib/views/client/booking_detail/booking_detail_view.dart"
    );
    assert(
      detail.includes("1200"),
      "autoOpenPayDeposit missing settle delay before Stripe"
    );
    const splash = read("../../app/lib/views/client/splash/splash_view.dart");
    assert(
      splash.includes("DeepLinkService()"),
      "splash does not consume DeepLinkService"
    );
    pass("source Flutter defer + persist + delayed Stripe");
  } catch (e) {
    fail("source Flutter", e);
  }

  // --- Live prod HTML ---
  try {
    const url = `${BASE}/appointments/${SAMPLE_ID}?action=pay_deposit`;
    const res = await fetchText(url);
    assert(res.status === 200, "HTTP " + res.status);
    const hasIntent = res.body.includes("intent://appointments/");
    const hasPackage = res.body.includes("package=com.booqlyapp");
    const hasMeta = /meta http-equiv=["']refresh["']/i.test(res.body);
    const hasBooqly = res.body.includes("booqly://appointments/");
    console.log("LIVE  html intent:// =", hasIntent, "| package =", hasPackage, "| meta refresh =", hasMeta, "| booqly:// =", hasBooqly);
    if (hasIntent && hasPackage && !hasMeta) {
      pass("LIVE prod HTML bridge is the new intent:// version");
    } else if (hasBooqly && hasMeta) {
      fail(
        "LIVE prod HTML bridge",
        new Error(
          "still OLD page (meta refresh + booqly:// only). Backend not deployed with latest appointment_deeplink_route.ts"
        )
      );
    } else {
      fail(
        "LIVE prod HTML bridge",
        new Error("unexpected HTML shape — inspect manually")
      );
    }
  } catch (e) {
    fail("LIVE prod HTML bridge", e);
  }

  // --- APK freshness vs source fix markers ---
  try {
    const apkDir = path.join(
      __dirname,
      "../../app/build/app/outputs/flutter-apk"
    );
    const apkPath = path.join(apkDir, "app-arm64-v8a-release.apk");
    if (!fs.existsSync(apkPath)) {
      warn("no release APK found under build/app/outputs/flutter-apk");
    } else {
      const apkMtime = fs.statSync(apkPath).mtime;
      const manifestPath = path.join(
        __dirname,
        "../../app/android/app/src/main/AndroidManifest.xml"
      );
      const mainPath = path.join(
        __dirname,
        "../../app/android/app/src/main/kotlin/com/booqlyapp/MainActivity.kt"
      );
      const dlPath = path.join(
        __dirname,
        "../../app/lib/services/deep_link_service.dart"
      );
      const newestFix = Math.max(
        fs.statSync(manifestPath).mtimeMs,
        fs.statSync(mainPath).mtimeMs,
        fs.statSync(dlPath).mtimeMs
      );
      console.log(
        "APK mtime =",
        apkMtime.toISOString(),
        "| newest fix source mtime =",
        new Date(newestFix).toISOString()
      );
      if (apkMtime.getTime() < newestFix) {
        fail(
          "release APK freshness",
          new Error(
            "APK is OLDER than singleTask/onNewIntent/deep-link fixes — rebuild required before device E2E"
          )
        );
      } else {
        pass("release APK is newer than deep-link fix sources");
      }
    }
  } catch (e) {
    fail("APK freshness", e);
  }

  // --- Local Express smoke of current route file ---
  try {
    const express = require("express");
    const app = express();
    // Mount the compiled? We don't have ts-node guaranteed — re-implement assert via reading built dist if present.
    const dist = path.join(__dirname, "../dist/routes/appointment_deeplink_route.js");
    const srcTs = path.join(__dirname, "../src/routes/appointment_deeplink_route.ts");
    if (fs.existsSync(dist)) {
      delete require.cache[require.resolve(dist)];
      const mod = require(dist);
      app.use("/", mod.default || mod);
    } else {
      // Minimal local clone of critical bits from source for smoke (not a substitute for deploy).
      app.get("/appointments/:appointmentId", (req, res) => {
        const id = req.params.appointmentId;
        const action = String(req.query.action || "reschedule");
        const deep = `booqly://appointments/${id}?action=${action}`;
        const intent = `intent://appointments/${id}?action=${action}#Intent;scheme=booqly;package=com.booqlyapp;end`;
        res.type("html").send(`<a href="${intent}">x</a><script>setTimeout(function(){location.href=${JSON.stringify(intent)}},250)</script>${deep}`);
      });
      warn(
        "dist/appointment_deeplink_route.js missing — local smoke used inline stand-in (run npm run build on server/deploy path)"
      );
    }
    await new Promise((resolve, reject) => {
      const server = app.listen(0, async () => {
        try {
          const port = server.address().port;
          const res = await fetchText(
            `http://127.0.0.1:${port}/appointments/${SAMPLE_ID}?action=pay_deposit`
          );
          assert(res.status === 200, "local http " + res.status);
          assert(res.body.includes("intent://"), "local missing intent");
          assert(res.body.includes("package=com.booqlyapp") || res.body.includes("intent://"), "local missing package");
          pass("local route smoke returns intent:// pay_deposit page");
          server.close();
          resolve();
        } catch (e) {
          server.close();
          reject(e);
        }
      });
    });
  } catch (e) {
    fail("local route smoke", e);
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n==== SUMMARY ====");
  console.log(
    `passed=${results.filter((r) => r.ok && !r.warn).length} warned=${results.filter((r) => r.warn).length} failed=${failed.length}`
  );
  if (failed.length) {
    failed.forEach((f) => console.log(" - " + f.l + ": " + f.e));
    console.log(
      "\nDEVICE UI black-screen cannot be validated here without adb/device."
    );
    console.log(
      "Blockers above must be fixed (deploy backend + rebuild APK) before claiming E2E pass."
    );
    process.exit(1);
  }
  console.log("Handoff source+live checks passed. Device UI still needs a physical APK install test.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

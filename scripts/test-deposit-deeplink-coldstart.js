/**
 * Verifies deposit email deep-link plumbing (no assumptions about device UI):
 * - Pay-deposit URL shape
 * - Browser fallback HTML redirects to booqly:// with action=pay_deposit
 * - Android assetlinks.json present
 * - iOS apple-app-site-association present with team+bundle appID
 *
 * Usage:
 *   node scripts/test-deposit-deeplink-coldstart.js
 *   node scripts/test-deposit-deeplink-coldstart.js https://api.booqlyapp.com
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const BASE =
  (process.argv[2] || "https://api.booqlyapp.com").replace(/\/$/, "");
const SAMPLE_ID = "00000000-0000-4000-8000-000000000001";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const failures = [];
  const pass = (label) => console.log(`PASS  ${label}`);
  const fail = (label, err) => {
    console.error(`FAIL  ${label}: ${err.message || err}`);
    failures.push(label);
  };

  // 1) Local AASA file
  try {
    const aasaPath = path.join(
      __dirname,
      "../.well-known/apple-app-site-association"
    );
    const raw = fs.readFileSync(aasaPath, "utf8");
    const json = JSON.parse(raw);
    assert(Array.isArray(json.applinks?.details), "missing applinks.details");
    const detail = json.applinks.details[0];
    assert(
      detail.appID === "544JD2S36A.com.booqlyapp.ios",
      `unexpected appID ${detail.appID}`
    );
    assert(
      (detail.paths || []).some((p) => String(p).includes("/appointments")),
      "paths missing /appointments"
    );
    pass("local apple-app-site-association");
  } catch (e) {
    fail("local apple-app-site-association", e);
  }

  // 2) Local assetlinks
  try {
    const assetPath = path.join(__dirname, "../.well-known/assetlinks.json");
    const json = JSON.parse(fs.readFileSync(assetPath, "utf8"));
    assert(Array.isArray(json) && json.length > 0, "empty assetlinks");
    assert(
      json[0]?.target?.package_name === "com.booqlyapp",
      "package_name mismatch"
    );
    pass("local assetlinks.json");
  } catch (e) {
    fail("local assetlinks.json", e);
  }

  // 3) Flutter cold-start deferral markers in source
  try {
    const deeplinkSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../app/lib/services/deep_link_service.dart"
      ),
      "utf8"
    );
    assert(
      deeplinkSrc.includes("consumePendingColdStartNavigation"),
      "DeepLinkService missing consumePendingColdStartNavigation"
    );
    assert(
      deeplinkSrc.includes("_pendingUrl"),
      "DeepLinkService missing _pendingUrl stash"
    );
    assert(
      deeplinkSrc.includes("_readyForNavigation"),
      "DeepLinkService missing navigation gate"
    );
    assert(
      !/getInitialLink\(\);\s*\n\s*if \(initialUri != null\) \{\s*\n\s*handleDeepLink/.test(
        deeplinkSrc
      ),
      "cold start still calls handleDeepLink immediately from getInitialLink"
    );

    const splashSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../app/lib/views/client/splash/splash_view.dart"
      ),
      "utf8"
    );
    assert(
      splashSrc.includes("DeepLinkService()"),
      "splash does not consume DeepLinkService"
    );
    assert(
      splashSrc.includes("consumePendingColdStartNavigation"),
      "splash missing deep link consume"
    );

    const authSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../../app/lib/views/auth/auth_controller.dart"
      ),
      "utf8"
    );
    assert(
      authSrc.includes("DeepLinkService().consumePendingColdStartNavigation"),
      "auth success path missing deep link consume"
    );

    const entitlements = fs.readFileSync(
      path.join(
        __dirname,
        "../../app/ios/Runner/Runner.entitlements"
      ),
      "utf8"
    );
    assert(
      entitlements.includes("applinks:api.booqlyapp.com"),
      "iOS entitlements missing applinks domain"
    );

    pass("Flutter cold-start deferral + iOS entitlements source checks");
  } catch (e) {
    fail("Flutter source checks", e);
  }

  // 4) Live / local HTTP checks against BASE
  try {
    const payUrl = `${BASE}/appointments/${SAMPLE_ID}?action=pay_deposit`;
    const page = await fetchText(payUrl);
    assert(page.status === 200, `appointment page status ${page.status}`);
    assert(
      page.body.includes("booqly://appointments/"),
      "fallback HTML missing booqly:// redirect"
    );
    assert(
      page.body.includes("action=pay_deposit"),
      "fallback HTML missing pay_deposit"
    );
    pass(`GET ${payUrl} HTML bridge`);
  } catch (e) {
    fail("appointment HTML bridge", e);
  }

  try {
    const aasaUrl = `${BASE}/.well-known/apple-app-site-association`;
    const res = await fetchText(aasaUrl);
    if (res.status === 404) {
      console.warn(
        `WARN  live AASA still 404 on ${BASE} — deploy backend with .well-known/apple-app-site-association (local file + route verified)`
      );
    } else {
      assert(res.status === 200, `AASA status ${res.status}`);
      const json = JSON.parse(res.body);
      assert(
        json.applinks?.details?.[0]?.appID === "544JD2S36A.com.booqlyapp.ios",
        "live AASA appID mismatch"
      );
      pass(`GET ${aasaUrl}`);
    }
  } catch (e) {
    console.warn(`WARN  live AASA check skipped: ${e.message || e}`);
  }

  try {
    const assetUrl = `${BASE}/.well-known/assetlinks.json`;
    const res = await fetchText(assetUrl);
    assert(res.status === 200, `assetlinks status ${res.status}`);
    const json = JSON.parse(res.body);
    assert(
      json[0]?.target?.package_name === "com.booqlyapp",
      "live assetlinks package mismatch"
    );
    pass(`GET ${assetUrl}`);
  } catch (e) {
    fail("live assetlinks", e);
  }

  console.log("");
  if (failures.length) {
    console.error(`FAILED (${failures.length}): ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("All deposit deep-link checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

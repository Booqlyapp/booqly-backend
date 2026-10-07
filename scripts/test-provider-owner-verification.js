/**
 * Runs professional-license and business-document OCR against
 * D:\my projects\Behance\new\Verification docs samples.
 */
const path = require("path");
const fs = require("fs");
const {
  DocumentVerificationService,
} = require("../dist/services/document-verification.service.js");

const ROOT = path.join(
  __dirname,
  "..",
  "..",
  "Verification docs"
);

const PROFESSIONAL_DIR = path.join(
  ROOT,
  "professional license samples (Cosmetology, Esthetics, Nail Technician, Barber, etc.)"
);
const EIN_DIR = path.join(ROOT, "EIN Document");
const LLC_DIR = path.join(ROOT, "LLC Certificate");

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());
}

async function runOne(label, filePath, kind) {
  const name = path.basename(filePath);
  process.stdout.write(`\n>>> [${kind}] ${name}\n`);
  const started = Date.now();
  let result;
  try {
    if (kind === "professional") {
      result = await DocumentVerificationService.verifyProfessionalLicense(filePath);
    } else {
      result = await DocumentVerificationService.verifyBusinessDocument(filePath);
    }
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return { label, name, kind, error: err.message };
  }
  const ms = Date.now() - started;
  console.log(
    `  status=${result.userStatus} score=${result.trustScore} (${ms}ms)`
  );
  console.log(`  message=${result.message}`);
  if (result.errorFlags?.length) {
    console.log(`  flags=${result.errorFlags.join(" | ")}`);
  }
  console.log(
    `  quality=${result.checks.imageQuality.earned}/${result.checks.imageQuality.total} text=${result.checks.textDetection.earned}/${result.checks.textDetection.total} doc=${result.checks.documentValidation.earned}/${result.checks.documentValidation.total}`
  );
  return {
    label,
    name,
    kind,
    status: result.userStatus,
    score: result.trustScore,
    message: result.message,
    errorFlags: result.errorFlags,
    checks: {
      quality: result.checks.imageQuality,
      text: result.checks.textDetection,
      doc: result.checks.documentValidation,
    },
    ms,
  };
}

async function main() {
  const results = [];

  for (const f of listFiles(PROFESSIONAL_DIR)) {
    results.push(await runOne("professional", f, "professional"));
  }
  for (const f of listFiles(EIN_DIR)) {
    results.push(await runOne("ein", f, "business"));
  }
  for (const f of listFiles(LLC_DIR)) {
    results.push(await runOne("llc", f, "business"));
  }

  const outPath = path.join(__dirname, "verification-sample-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} results to ${outPath}`);

  console.log("\n========== SUMMARY ==========");
  for (const r of results) {
    if (r.error) {
      console.log(`FAIL/ERR  [${r.kind}] ${r.name}: ${r.error}`);
    } else {
      console.log(
        `${String(r.status).padEnd(9)} score=${String(r.score).padStart(3)}  [${r.kind}] ${r.name}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

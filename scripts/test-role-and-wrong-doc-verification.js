/**
 * 1) Role-gate matrix (mirrors controller rules)
 * 2) Wrong-document OCR: license through business scorer and vice versa
 * 3) Full sample re-run summary via DocumentVerificationService
 */
const path = require("path");
const fs = require("fs");
const {
  DocumentVerificationService,
} = require("../dist/services/document-verification.service.js");

const ROOT = path.join(__dirname, "..", "..", "Verification docs");
const PROFESSIONAL_DIR = path.join(
  ROOT,
  "professional license samples (Cosmetology, Esthetics, Nail Technician, Barber, etc.)"
);
const EIN_DIR = path.join(ROOT, "EIN Document");
const LLC_DIR = path.join(ROOT, "LLC Certificate");

function canUploadIdentity(role, isTeamMember) {
  return (
    role === "client" ||
    role === "solo" ||
    (role === "suite" && isTeamMember === true)
  );
}
function canUploadLicense(role, isTeamMember) {
  return role === "solo" || (role === "suite" && isTeamMember === true);
}
function canUploadBusiness(role, isTeamMember) {
  return role === "solo" || (role === "suite" && isTeamMember !== true);
}
function canGoogleBusiness(role, isTeamMember) {
  return role === "suite" && isTeamMember !== true;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testRoleMatrix() {
  const cases = [
    // [role, isTeamMember, identity, license, business, google]
    ["client", false, true, false, false, false],
    ["solo", false, true, true, true, false],
    ["suite", false, false, false, true, true], // owner
    ["suite", true, true, true, false, false], // team member
  ];

  console.log("\n========== ROLE GATE MATRIX ==========");
  for (const [role, tm, id, lic, biz, g] of cases) {
    const label = tm ? `${role}+team` : role === "suite" ? `${role}+owner` : role;
    assert(canUploadIdentity(role, tm) === id, `${label} identity`);
    assert(canUploadLicense(role, tm) === lic, `${label} license`);
    assert(canUploadBusiness(role, tm) === biz, `${label} business`);
    assert(canGoogleBusiness(role, tm) === g, `${label} google`);
    console.log(
      `${label.padEnd(14)} ID=${id ? "Y" : "N"}  License=${lic ? "Y" : "N"}  Business=${biz ? "Y" : "N"}  Google=${g ? "Y" : "N"}`
    );
  }
  console.log("Role matrix OK");
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).isFile());
}

async function runOne(label, filePath, kind) {
  const name = path.basename(filePath);
  const started = Date.now();
  let result;
  if (kind === "professional") {
    result = await DocumentVerificationService.verifyProfessionalLicense(filePath);
  } else {
    result = await DocumentVerificationService.verifyBusinessDocument(filePath);
  }
  return {
    label,
    name,
    kind,
    status: result.userStatus,
    score: result.trustScore,
    message: result.message,
    errorFlags: result.errorFlags,
    ms: Date.now() - started,
  };
}

async function testWrongDocumentType() {
  console.log("\n========== WRONG DOCUMENT TYPE ==========");
  const licenseFiles = listFiles(PROFESSIONAL_DIR);
  const einFiles = listFiles(EIN_DIR);
  const llcFiles = listFiles(LLC_DIR);

  // Put a clear EIN through professional verifier → must reject
  const einSample =
    einFiles.find((f) => /ein-confirmation-letter/i.test(path.basename(f))) ||
    einFiles[0];
  const einAsLicense =
    await DocumentVerificationService.verifyProfessionalLicense(einSample);
  console.log(
    `EIN as professional: status=${einAsLicense.userStatus} score=${einAsLicense.trustScore} | ${einAsLicense.message}`
  );
  assert(
    einAsLicense.userStatus === "rejected",
    "EIN uploaded as professional license must be rejected"
  );

  // Put a clear license through business verifier → must reject
  const licenseSample =
    licenseFiles.find((f) => /75D40367/i.test(path.basename(f))) ||
    licenseFiles[0];
  const licenseAsBiz =
    await DocumentVerificationService.verifyBusinessDocument(licenseSample);
  console.log(
    `License as business: status=${licenseAsBiz.userStatus} score=${licenseAsBiz.trustScore} | ${licenseAsBiz.message}`
  );
  assert(
    licenseAsBiz.userStatus === "rejected",
    "Professional license uploaded as business doc must be rejected"
  );

  // LLC returned notice still rejected as business
  const returned =
    llcFiles.find((f) => /ConvertTiffToPDF 2/i.test(path.basename(f))) || null;
  if (returned) {
    const r = await DocumentVerificationService.verifyBusinessDocument(returned);
    console.log(
      `Returned LLC filing: status=${r.userStatus} score=${r.trustScore} | ${r.message}`
    );
    assert(r.userStatus === "rejected", "Returned filing must stay rejected");
  }

  console.log("Wrong-document checks OK");
}

async function testAllSamples() {
  console.log("\n========== FULL SAMPLE RUN ==========");
  const results = [];
  for (const f of listFiles(PROFESSIONAL_DIR)) {
    const r = await runOne("professional", f, "professional");
    results.push(r);
    console.log(
      `[professional] ${r.status.padEnd(9)} score=${String(r.score).padStart(3)}  ${r.name}`
    );
  }
  for (const f of listFiles(EIN_DIR)) {
    const r = await runOne("ein", f, "business");
    results.push(r);
    console.log(
      `[ein]          ${r.status.padEnd(9)} score=${String(r.score).padStart(3)}  ${r.name}`
    );
  }
  for (const f of listFiles(LLC_DIR)) {
    const r = await runOne("llc", f, "business");
    results.push(r);
    console.log(
      `[llc]          ${r.status.padEnd(9)} score=${String(r.score).padStart(3)}  ${r.name}`
    );
  }

  const outPath = path.join(__dirname, "verification-sample-results.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${results.length} results to ${outPath}`);

  const counts = { verified: 0, pending: 0, rejected: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  console.log(
    `Totals: verified=${counts.verified} pending=${counts.pending} rejected=${counts.rejected}`
  );
  return results;
}

async function main() {
  testRoleMatrix();
  await testWrongDocumentType();
  await testAllSamples();
  console.log("\nALL TESTS PASSED");
}

main().catch((e) => {
  console.error("\nTEST FAILED:", e.message || e);
  process.exit(1);
});

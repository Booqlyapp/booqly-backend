const { DocumentVerificationService } = require("../dist/services/document-verification.service.js");

async function run(path) {
  console.log("\n=========== " + path.split("\\").pop() + " ===========");
  const t0 = Date.now();
  const a = await DocumentVerificationService.verifyDocument(path);
  console.log("elapsed(ms)", Date.now() - t0);
  console.log("userStatus:", a.userStatus, "| trustScore:", a.trustScore);
  console.log("message:", a.message);
  console.log("errorFlags:", a.errorFlags);
  console.log("--- imageQuality earned=" + a.checks.imageQuality.earned);
  a.checks.imageQuality.details.forEach((d) => console.log("   " + d));
  console.log("--- textDetection earned=" + a.checks.textDetection.earned);
  a.checks.textDetection.details.forEach((d) => console.log("   " + d));
  console.log("--- documentValidation earned=" + a.checks.documentValidation.earned);
  a.checks.documentValidation.details.forEach((d) => console.log("   " + d));
}

(async () => {
  await run("C:\\Users\\fc\\AppData\\Local\\Temp\\opencode\\pdfcheck\\synthetic_dl.png");
  await run("C:\\Users\\fc\\AppData\\Local\\Temp\\opencode\\pdfcheck\\synthetic_passport.png");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
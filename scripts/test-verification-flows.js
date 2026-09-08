const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createCanvas } = require("@napi-rs/canvas");
const { DocumentVerificationService } = require("../dist/services/document-verification.service.js");
const { extractPdfText, renderPdfFirstPageToPng } = require("../dist/utils/pdf-utils.js");

const TMP = "C:\\Users\\fc\\AppData\\Local\\Temp\\opencode\\pdfcheck";

function makeImage(out, w, h) {
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#dde6f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#123c7a";
  ctx.font = `${Math.round(h / 10)}px Arial`;
  ctx.fillText("DRIVER LICENSE", 30, h * 0.5);
  fs.writeFileSync(out, cv.toBuffer("image/png"));
}

async function qualityCheck(p) {
  const m = await sharp(p).metadata();
  if (!m.width || !m.height) return { passes: false, message: "unreadable" };
  if (m.width < 300 || m.height < 180) return { passes: false, message: `too small ${m.width}x${m.height}` };
  return { passes: true, message: "" };
}

async function main() {
  process.chdir("C:\\Windows\\Temp"); // simulate a pm2 run from an unrelated cwd
  let failures = 0;
  function report(name, ok, detail) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
    if (!ok) failures += 1;
  }

  // 1. CLIENT: identity pipeline with OFFLINE OCR (langPath = ocr-data)
  const dl = path.join(TMP, "synthetic_dl.png");
  const pp = path.join(TMP, "synthetic_passport.png");
  const a1 = await DocumentVerificationService.verifyDocument(dl);
  console.log("  [client identity DL] status=" + a1.userStatus + " score=" + a1.trustScore + " -> " + a1.message);
  report("client identity (driver license verified)", a1.userStatus === "verified", "score " + a1.trustScore);

  const recog = `OCR extracted ${a1.checks.textDetection.details[0] ?? ""}`;
  report("client identity (OCR extracted real text offline)", /OCR extracted \d+ characters/.test(a1.checks.textDetection.details[0] || ""), recog);

  const a2 = await DocumentVerificationService.verifyDocument(pp);
  console.log("  [client identity PP] status=" + a2.userStatus + " score=" + a2.trustScore + " -> " + a2.message);
  report("client identity (passport verified)", a2.userStatus === "verified", "score " + a2.trustScore);

  // 2. SOLO PROFESSIONAL: image must pass readable-quality check (>= 300x180)
  const proGood = path.join(TMP, "pro_good.png");
  const proTiny = path.join(TMP, "pro_tiny.png");
  makeImage(proGood, 900, 560);
  makeImage(proTiny, 200, 150);
  const qg = await qualityCheck(proGood);
  report("solo professional (good license image passes)", qg.passes, qg.message);
  const qt = await qualityCheck(proTiny);
  report("solo professional (tiny image rejected)", !qt.passes, qt.message);

  // 3. SOLO BUSINESS image
  const bizGood = path.join(TMP, "biz_good.png");
  makeImage(bizGood, 1200, 900);
  const bq = await qualityCheck(bizGood);
  report("solo business (good image passes)", bq.passes, bq.message);

  // 4. SOLO BUSINESS PDF with embedded text (real EIN letter)
  const einPdf = "D:\\my projects\\Behance\\New folder\\verification docs\\EIN Document\\IRSEINCorcoranConsultingLLC (1).pdf";
  const einText = await extractPdfText(einPdf);
  report("solo business (EIN PDF text path passes)", einText.trim().length >= 80, "extracted " + einText.length + " chars");

  // 5. SOLO BUSINESS scanned PDF (LLC cert, image-only)
  const llcPdf = "D:\\my projects\\Behance\\New folder\\verification docs\\LLC Certificate\\ConvertTiffToPDF (1).pdf";
  const llcText = await extractPdfText(llcPdf);
  const preview = path.join(TMP, "llc_preview.png");
  const rendered = await renderPdfFirstPageToPng(llcPdf, preview);
  const scanOk = llcText.trim().length < 80 && rendered && rendered.width >= 300 && rendered.height >= 180;
  report("solo business (scanned LLC PDF renders >= 300x180)", scanOk, "text=" + llcText.length + " render=" + (rendered ? rendered.width + "x" + rendered.height : "null"));

  // 6. SOLO BUSINESS corrupt "PDF" (text file renamed .pdf) -> reject
  const badPdf = path.join(TMP, "not_a_pdf.pdf");
  fs.writeFileSync(badPdf, "this is not a pdf at all, just plain text content that is not long enough to ever pass any check in any way whatsoever ok maybe it is actually pretty long but still a pdf");
  const badText = await extractPdfText(badPdf);
  const badPreview = path.join(TMP, "bad_preview.png");
  const badRender = await renderPdfFirstPageToPng(badPdf, badPreview);
  const badOk = badText.trim().length < 80 && badRender === null;
  report("solo business (corrupt PDF rejected)", badOk, "text=" + badText.length + " render=" + JSON.stringify(badRender));

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
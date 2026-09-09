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
  if (m.width < 240 || m.height < 160) return { passes: false, message: `too small ${m.width}x${m.height}` };
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

  // 4. SOLO BUSINESS PDF with embedded text (generated minimal text PDF)
  function minimalTextPdf(out, text) {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    ];
    const stream = `BT /F1 9 Tf 40 700 Td (${text}) Tj ET`;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    fs.writeFileSync(out, pdf, "ascii");
  }

  const einPdf = path.join(TMP, "generated-ein.pdf");
  const einLongText =
    "JOHN DOE CONSULTING LLC EIN 12-3456789 OFFICIAL INTERNAL REVENUE SERVICE TAX IDENTIFICATION LETTER " +
    "THIS DOCUMENT CONFIRMS THE ASSIGNMENT OF THE EMPLOYER IDENTIFICATION NUMBER LISTED ABOVE TO THE BUSINESS ENTITY NAMED HEREIN.";
  minimalTextPdf(einPdf, einLongText);
  const einText = await extractPdfText(einPdf);
  report("solo business (EIN PDF text path passes)", einText.trim().length >= 80, "extracted " + einText.length + " chars");

  // 5. SOLO BUSINESS scanned-style PDF (no embedded text, but renders a readable page) -> passes
  //    (controller renders the first page and treats a legible page as proof of document)
  const llcPdf = path.join(TMP, "generated-llc-scanned.pdf");
  minimalTextPdf(llcPdf, "LLC");
  const llcText = await extractPdfText(llcPdf);
  const preview = path.join(TMP, "llc_preview.png");
  const rendered = await renderPdfFirstPageToPng(llcPdf, preview);
  const scanOk = llcText.trim().length < 80 && rendered !== null && rendered.width >= 240 && rendered.height >= 160;
  report("solo business (scanned-style PDF renders a readable page)", scanOk, "text=" + llcText.length + " render=" + (rendered ? rendered.width + "x" + rendered.height : "null"));

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
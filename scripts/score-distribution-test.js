const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { DocumentVerificationService } = require("../dist/services/document-verification.service.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verif-dist-"));

async function render(name, bg, textLines, size = 1200) {
  const svg = `<svg width="${size}" height="${Math.round(size * 0.6)}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${bg}"/>
    ${textLines
      .map(
        (t, i) =>
          `<text x="40" y="${80 + i * 70}" font-family="Arial" font-size="46" fill="#111">${t}</text>`
      )
      .join("")}
  </svg>`;
  const file = path.join(tmp, name);
  await sharp(Buffer.from(svg)).flatten({ background: bg }).jpeg({ quality: 90 }).toFile(file);
  return file;
}

(async () => {
  const cases = [];
  cases.push({ label: "blank-white", file: await render("blank.jpg", "#ffffff", []) });
  cases.push({
    label: "random-text",
    file: await render("random.jpg", "#eeeeee", [
      "The quick brown fox jumps over the lazy dog",
      "Meeting scheduled for Tuesday at 3pm",
      "Please bring your umbrellas tomorrow morning",
    ]),
  });
  cases.push({
    label: "fake-signals",
    file: await render("fake.jpg", "#f5f5f5", [
      "SAMPLE ONLY",
      "SPECIMEN - NOT FOR IDENTIFICATION",
      "NOVELTY ID - MOVIE PROP",
    ]),
  });
  cases.push({
    label: "real-license-ish",
    file: await render("license.jpg", "#ffffff", [
      "STATE OF CALIFORNIA",
      "DRIVER LICENSE",
      "DOB: 05/14/1990",
      "EXP: 05/14/2028",
      "DL: F1234567",
    ]),
  });
  cases.push({ label: "US-passport", file: path.join(process.cwd(), "United_States_Next_Generation_Passport.jpg") });
  cases.push({ label: "testing.jpg", file: path.join(process.cwd(), "testing.jpg") });

  for (const c of cases) {
    const r = await DocumentVerificationService.verifyDocument(c.file);
    console.log(
      `${c.label.padEnd(16)} status=${r.userStatus.padEnd(8)} score=${String(r.trustScore).padEnd(3)} imgQ=${r.checks.imageQuality.earned}/${r.checks.imageQuality.total} ocr=${r.checks.textDetection.earned}/${r.checks.textDetection.total} valid=${r.checks.documentValidation.earned}/${r.checks.documentValidation.total}`
    );
  }
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });
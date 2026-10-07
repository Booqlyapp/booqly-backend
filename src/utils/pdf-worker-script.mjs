import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

const [mode, inFile, outFile, pageArg] = process.argv.slice(2);

if (!inFile || !fs.existsSync(inFile)) {
  console.log(JSON.stringify({ ok: false, error: "PDF file not found" }));
  process.exit(0);
}

let doc;
try {
  const task = getDocument({
    data: new Uint8Array(fs.readFileSync(inFile)),
    isEvalSupported: false,
  });
  doc = await task.promise;
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err.message }));
  process.exit(0);
}

try {
  if (mode === "text") {
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text +=
        " " +
        content.items
          .filter((it) => it && typeof it.str === "string")
          .map((it) => it.str)
          .join(" ");
    }
    console.log(JSON.stringify({ ok: true, text: text.trim() }));
  } else if (mode === "render") {
    if (!outFile) {
      console.log(JSON.stringify({ ok: false, error: "No output path given" }));
      process.exit(0);
    }
    const pageNumber = Math.max(1, parseInt(pageArg || "1", 10) || 1);
    if (pageNumber > doc.numPages) {
      console.log(
        JSON.stringify({
          ok: false,
          error: `Page ${pageNumber} out of range (${doc.numPages} pages)`,
        })
      );
      process.exit(0);
    }
    const page = await doc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.max(1, 1200 / baseViewport.width);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height)
    );
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const buffer = canvas.toBuffer("image/png");
    await fs.promises.writeFile(outFile, buffer);
    console.log(
      JSON.stringify({
        ok: true,
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        page: pageNumber,
      })
    );
  } else {
    console.log(JSON.stringify({ ok: false, error: "Unknown mode" }));
  }
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: err.message }));
} finally {
  try {
    await doc.cleanup();
  } catch {}
  process.exit(0);
}
import { execFile } from "child_process";
import fs from "fs";
import path from "path";

const WORKER_FILENAME = "pdf-worker-script.mjs";

function resolveWorkerPath(): string {
  const distCandidate = path.join(__dirname, WORKER_FILENAME);
  if (fs.existsSync(distCandidate)) {
    return distCandidate;
  }
  const srcCandidate = path.join(
    __dirname,
    "..",
    "..",
    "src",
    "utils",
    WORKER_FILENAME
  );
  if (fs.existsSync(srcCandidate)) {
    return srcCandidate;
  }
  throw new Error(
    `PDF worker file (${WORKER_FILENAME}) not found next to ${__dirname}`
  );
}

function runPdfWorker(args: string[]): Promise<any> {
  return new Promise((resolve) => {
    const workerPath = resolveWorkerPath();
    execFile(
      process.execPath,
      [workerPath, ...args],
      { timeout: 60000, maxBuffer: 10 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          console.error("PDF worker failed:", error.message);
          resolve({ ok: false, error: error.message });
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (parseError: any) {
          console.error(
            "PDF worker returned invalid JSON:",
            parseError.message,
            stdout.slice(0, 200)
          );
          resolve({ ok: false, error: "Invalid PDF worker output" });
        }
      }
    );
  });
}

/**
 * Extract embedded text from a PDF. Returns "" when none is available
 * (e.g. scanned documents).
 */
export async function extractPdfText(pdfPath: string): Promise<string> {
  const result = await runPdfWorker(["text", pdfPath]);
  if (result && result.ok === true && typeof result.text === "string") {
    return result.text;
  }
  return "";
}

/**
 * Render a PDF page (1-based) to a PNG file.
 * Returns the rendered dimensions, or null on failure.
 */
export async function renderPdfPageToPng(
  pdfPath: string,
  outPngPath: string,
  pageNumber: number = 1
): Promise<{ width: number; height: number } | null> {
  const result = await runPdfWorker([
    "render",
    pdfPath,
    outPngPath,
    String(pageNumber),
  ]);
  if (
    result &&
    result.ok === true &&
    typeof result.width === "number" &&
    typeof result.height === "number" &&
    fs.existsSync(outPngPath)
  ) {
    return { width: result.width, height: result.height };
  }
  return null;
}

/**
 * Render the first page of a PDF to a PNG file.
 * Returns the rendered dimensions, or null on failure.
 */
export async function renderPdfFirstPageToPng(
  pdfPath: string,
  outPngPath: string
): Promise<{ width: number; height: number } | null> {
  return renderPdfPageToPng(pdfPath, outPngPath, 1);
}
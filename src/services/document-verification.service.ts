import Tesseract from "tesseract.js";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { parse } from "mrz";

export interface VerificationCheckResult {
  passed: boolean;
  earned: number;
  total: number;
  details: string[];
}

export interface VerificationAnalysis {
  userStatus: "verified" | "pending" | "rejected";
  trustScore: number;
  message: string;
  errorFlags: string[];
  checks: {
    imageQuality: VerificationCheckResult;
    textDetection: VerificationCheckResult;
    documentValidation: VerificationCheckResult;
  };
}

const US_STATES = [
  "ALABAMA",
  "ALASKA",
  "ARIZONA",
  "ARKANSAS",
  "CALIFORNIA",
  "COLORADO",
  "CONNECTICUT",
  "DELAWARE",
  "FLORIDA",
  "GEORGIA",
  "HAWAII",
  "IDAHO",
  "ILLINOIS",
  "INDIANA",
  "IOWA",
  "KANSAS",
  "KENTUCKY",
  "LOUISIANA",
  "MAINE",
  "MARYLAND",
  "MASSACHUSETTS",
  "MICHIGAN",
  "MINNESOTA",
  "MISSISSIPPI",
  "MISSOURI",
  "MONTANA",
  "NEBRASKA",
  "NEVADA",
  "NEW HAMPSHIRE",
  "NEW JERSEY",
  "NEW MEXICO",
  "NEW YORK",
  "NORTH CAROLINA",
  "NORTH DAKOTA",
  "OHIO",
  "OKLAHOMA",
  "OREGON",
  "PENNSYLVANIA",
  "RHODE ISLAND",
  "SOUTH CAROLINA",
  "SOUTH DAKOTA",
  "TENNESSEE",
  "TEXAS",
  "UTAH",
  "VERMONT",
  "VIRGINIA",
  "WASHINGTON",
  "WEST VIRGINIA",
  "WISCONSIN",
  "WYOMING",
  "DISTRICT OF COLUMBIA",
];

const US_STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
  "PR",
  "GU",
  "VI",
  "AS",
  "MP",
];

const US_ID_KEYWORDS = [
  "DRIVER",
  "DRIVING",
  "LICENSE",
  "IDENTIFICATION",
  "IDENTITY",
  "UNITED STATES",
  "PASSPORT",
  "REAL ID",
  "STATE OF",
  "GOVERNMENT",
  "DEPARTMENT OF PUBLIC SAFETY",
  "DPS",
  "DMV",
  "BUREAU OF MOTOR VEHICLES",
  "BMV",
  "U.S. DEPARTMENT OF STATE",
  "AMERICAN CITIZEN",
  "OFFICIAL",
  "PHOTO ID",
];

const FAKE_SIGNAL_KEYWORDS = [
  "SAMPLE",
  "SPECIMEN",
  "TRAINING",
  "NOT FOR IDENTIFICATION",
  "FAKE",
  "FOR DISPLAY PURPOSES",
  "NOVELTY",
  "RECREATIONAL",
  "MOVIE PROP",
  "PROP ONLY",
];

const DOB_PATTERN = /(DOB|DATE OF BIRTH|BIRTH DATE)\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s*[0-9]{2,4}|[0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i;
const EXPIRY_PATTERN = /(EXP|EXPIRES|EXPIRATION|VALID THRU|VALID TO|EXPIRATION DATE)\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s*[0-9]{2,4})/i;
const GENERAL_DATE_PATTERN = /\b([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4}|[0-9]{1,2}\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s*[0-9]{2,4})\b/i;
const GENERAL_DATE_GLOBAL = new RegExp(GENERAL_DATE_PATTERN.source, "gi");
const ID_NUMBER_PATTERN = /(DL|DLN|ID|LIC|LICENSE|LICENCENO|#|NO|PASSPORT(?:\s*NO)?)\s*[:\-]?\s*([A-Z]{1,4}\d{2,12}|\d{5,12})/i;

export const MIN_DOC_WIDTH = 240;
export const MIN_DOC_HEIGHT = 160;
const MIN_WIDTH = MIN_DOC_WIDTH;
const MIN_HEIGHT = MIN_DOC_HEIGHT;
const MIN_SHARPNESS = 8;
const MAX_DIM_RATIO = 4.5;

let ocrInProgress = 0;

async function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function analyzeImageQuality(filePath: string) {
  const details: string[] = [];
  let earned = 0;
  const total = 30;

  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions");
    }

    if (metadata.width >= MIN_WIDTH && metadata.height >= MIN_HEIGHT) {
      earned += 5;
      details.push(`Resolution acceptable: ${metadata.width}x${metadata.height}`);
    } else {
      details.push(`Low resolution: ${metadata.width}x${metadata.height}`);
    }

    const ratio = metadata.width / metadata.height;
    if (ratio >= 1.2 && ratio <= MAX_DIM_RATIO) {
      earned += 5;
      details.push(`Aspect ratio acceptable: ${ratio.toFixed(2)}`);
    } else {
      details.push(`Unusual aspect ratio: ${ratio.toFixed(2)}`);
    }

    const { data, info } = await sharp(filePath)
      .grayscale()
      .resize({ width: 200, fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let sum = 0;
    let sumSq = 0;
    const count = data.length;
    for (let i = 0; i < count; i += 4) {
      const v = data[i];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / count;
    const variance = sumSq / count - mean * mean;
    const stdDev = Math.sqrt(Math.max(variance, 0));

    if (stdDev >= MIN_SHARPNESS) {
      earned += 10;
      details.push(`Image sharpness acceptable (stdDev ${stdDev.toFixed(2)})`);
    } else {
      details.push(`Image appears blurry or flat (stdDev ${stdDev.toFixed(2)})`);
    }

    if (mean > 40 && mean < 235) {
      earned += 5;
      details.push(`Exposure acceptable (mean ${mean.toFixed(1)})`);
    } else {
      details.push(`Unusual exposure (mean ${mean.toFixed(1)})`);
    }

    const fileStat = await fs.stat(filePath);
    if (fileStat.size >= 20000 && fileStat.size <= 25000000) {
      earned += 5;
      details.push(`File size acceptable (${(fileStat.size / 1024).toFixed(1)} KB)`);
    } else {
      details.push(`Unusual file size (${(fileStat.size / 1024).toFixed(1)} KB)`);
    }
  } catch (err: any) {
    details.push(`Image quality analysis failed: ${err.message}`);
  }

  return { earned, total, details };
}

async function runOCR(filePath: string): Promise<{ text: string; confidence: number }> {
  ocrInProgress += 1;
  try {
    const worker = await timeout(
      Tesseract.createWorker("eng", 1, {
        langPath: path.join(__dirname, "..", "..", "ocr-data"),
        logger: (m) => {
          if (m.status === "recognizing text") {
            process.stdout.write(`\rOCR progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      }),
      90000,
      "OCR worker creation"
    );

    try {
      const result = await timeout(
        worker.recognize(filePath, {},
          { text: true, blocks: true })
          .then((r: any) => r),
        90000,
        "OCR recognition"
      );

      const text = (result.data?.text || "").trim();
      const confidence = result.data?.confidence || 0;
      return { text, confidence };
    } finally {
      await worker.terminate();
    }
  } catch (err: any) {
    process.stdout.write("\n");
    console.error("OCR failed:", err.message);
    return { text: "", confidence: 0 };
  } finally {
    ocrInProgress -= 1;
    if (ocrInProgress === 0) process.stdout.write("\n");
  }
}

function containsAny(text: string, keywords: string[]): boolean {
  const upper = text.toUpperCase();
  return keywords.some((k) => upper.includes(k));
}

function countKeywordHits(text: string, keywords: string[]): number {
  const upper = text.toUpperCase();
  return keywords.reduce((count, k) => {
    const pattern = k.replace(/\s+/g, "\\s+");
    const regex = new RegExp(`\\b${pattern}\\b`);
    return regex.test(upper) ? count + 1 : count;
  }, 0);
}

function validateDatesInText(text: string): { dates: string[]; validCount: number; details: string[] } {
  const details: string[] = [];
  const matches = text.match(/[A-Z]{2,}[0-9]{2,}/g);
  void matches;
  const MONTH_MAP: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
  };
  const allDates = Array.from(text.matchAll(GENERAL_DATE_GLOBAL), (m) => m[0]);
  let validCount = 0;

  for (const raw of allDates) {
    let day: number, month: number, year: number;

    const alphaMatch = raw.match(/^([0-9]{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC)[A-Z]*\s*([0-9]{2,4})$/i);
    if (alphaMatch) {
      day = parseInt(alphaMatch[1], 10);
      month = MONTH_MAP[alphaMatch[2].toUpperCase()];
      year = parseInt(alphaMatch[3], 10);
      if (year < 100) year += 2000;
    } else {
      const normalized = raw.replace(/[\-\.]/g, "/");
      const parts = normalized.split("/").map((p) => p);
      if (parts.length !== 3) continue;
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
      if (year < 100) year += 2000;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1940 && year <= 2040) {
      validCount += 1;
    } else {
      details.push(`Invalid date found: ${raw}`);
    }
  }

  return { dates: allDates, validCount, details };
}

function detectDocumentType(text: string): "driver_license" | "passport" | "state_id_notice" | "unknown" {
  const upper = text.toUpperCase();
  if (/PASSPORT/.test(upper) || /P<|I<|V</.test(upper)) {
    return "passport";
  }
  if (/DRIVER|DRIVING|LICENSE/.test(upper)) {
    return "driver_license";
  }
  if (/STATE OF|IDENTIFICATION|IDENTITY|PHOTO ID|GOVERNMENT/.test(upper)) {
    return "state_id_notice";
  }
  return "unknown";
}

function validateMRZ(text: string): { valid: boolean; details: string[] } {
  const details: string[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && /^[A-Z0-9< ]+$/.test(l));

  const mrzLines = lines.filter((l) => l.length >= 30);

  if (mrzLines.length === 0) {
    return { valid: false, details: ["No MRZ line found in OCR text"] };
  }

  // First line should start with P<, I<, V<, or similar (document type + issuing country)
  const firstLineIdx = mrzLines.findIndex((l) => /^[PIV][<>]/.test(l) || /^[A-Z0-9]{2}[<>]/.test(l));
  if (firstLineIdx === -1) {
    return { valid: false, details: ["No MRZ first line (P< / I< / V<) found"] };
  }

  const line1 = mrzLines[firstLineIdx].replace(/\s+/g, "");
  // Second line is typically the next MRZ-only line, or it may be joined to line1 already
  let joined = line1;
  if (firstLineIdx + 1 < mrzLines.length) {
    const line2 = mrzLines[firstLineIdx + 1].replace(/\s+/g, "");
    // If line1 is 44 long (TD3), line2 should be 44 as well; if line1 is 30 (TD1), line2 30, line3 30
    if (line1.length === 44 && line2.length >= 30) {
      joined = line1 + line2.substring(0, 44);
    } else if (line1.length === 30 && line2.length >= 30) {
      joined = line1;
    }
  }

  if (joined.length < 44) {
    details.push(`MRZ line too short (${joined.length} chars)`);
    return { valid: false, details };
  }

  try {
    const result = parse(joined);
    details.push(`MRZ parsed (format: ${result.format})`);
    if (result.details) {
      const failedFields = (result.details as any[]).filter((d: any) => d.valid === false);
      if (failedFields.length === 0) {
        details.push("All MRZ check digits are valid");
        return { valid: true, details };
      }
      details.push(
        `MRZ check digit failures: ${failedFields.map((d: any) => d.field).join(", ")}`
      );
      return { valid: false, details };
    }
    details.push("MRZ parsed but no detailed check digit report available");
    return { valid: true, details };
  } catch (err: any) {
    details.push(`MRZ validation error: ${err.message}`);
    return { valid: false, details };
  }
}

const PROFESSIONAL_LICENSE_KEYWORDS = [
  "BOARD OF BARBERING AND COSMETOLOGY",
  "BOARD OF COSMETOLOGY",
  "STATE BOARD OF COSMETOLOGY AND BARBERS",
  "DIVISION OF LICENSING SERVICES",
  "DEPARTMENT OF BUSINESS AND PROFESSIONAL REGULATION",
  "DEPARTMENT OF CONSUMER AFFAIRS",
  "ESTHETICIAN",
  "COSMETOLOGIST",
  "COSMETOLOGY",
  "BARBER",
  "APPEARANCE ENHANCEMENT",
  "COSMETOLOGY SALON",
  "CE PROVIDER",
  "HAS BEEN DULY LICENSED",
  "POST IN PUBLIC VIEW",
  "LICENSE NO",
  "LICENSE NUMBER",
  "VALID UNTIL",
  "EXP DATE",
  "EXPIRATION DATE",
];

const PROFESSIONAL_PLACEHOLDER_SIGNALS = [
  "COMPANY NAME",
  "XX-00000-XX",
  "00/00/0000",
];

const EIN_KEYWORDS = [
  "DEPARTMENT OF THE TREASURY",
  "INTERNAL REVENUE SERVICE",
  "WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER",
  "EMPLOYER IDENTIFICATION NUMBER",
  "FORM: SS-4",
  "FORM SS-4",
  "CP 575",
  "CINCINNATI",
];

const EIN_FAKE_SIGNALS = [
  "EXAMPLE ONLY",
  "SAMPLE",
  "SPECIMEN",
  "FOR DISPLAY PURPOSES",
];

const LLC_KEYWORDS = [
  "CERTIFICATE OF FORMATION",
  "ARTICLES OF ORGANIZATION",
  "CERTIFICATE OF ORGANIZATION",
  "LIMITED LIABILITY COMPANY",
  "SECRETARY OF STATE",
  "DIVISION OF CORPORATIONS",
  "CORPORATIONS DIVISION",
  "DOMESTIC LIMITED LIABILITY COMPANY",
  "FILED",
];

const LLC_REJECT_SIGNALS = [
  "HAS NOT BEEN FILED",
  "BEING RETURNED",
  "RETURNED TO YOU FOR THE FOLLOWING REASON",
];

const EIN_NUMBER_PATTERN =
  /\b(?:EIN|EMPLOYER IDENTIFICATION NUMBER)[:\s#]*([0-9]{2}\s*-\s*[0-9]{7})\b/i;
const EIN_NUMBER_LOOSE_PATTERN = /\b([0-9]{2}-[0-9]{7})\b/;

const LICENSE_NUMBER_PATTERN =
  /\b(?:LICENSE\s*NO\.?|LICENSE\s*NUMBER|UNIQUE\s*ID\s*NUMBER|LIC(?:ENSE)?\s*#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\s\-]{3,20})\b/i;

const EXPIRY_FIELD_PATTERNS: RegExp[] = [
  /VALID\s+UNTIL\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  /(?:VALID\s+)?UNTIL\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  /EXP(?:IRATION)?\s*DATE\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  /EXP\s*DATE\s*[:\-]?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
  /EXPIRATION\s*DATE\s*[:\-]?\s*MO\.?\s*([0-9]{1,2})\s*DAY\s*([0-9]{1,2})\s*YR\.?\s*([0-9]{2,4})/i,
  /EXPIRATION\s*DATE[:\s]*([A-Z]{3,9}\.?\s+[0-9]{1,2},?\s+[0-9]{4})/i,
  /EXP(?:IRES|IRATION)?\s*[:\-]?\s*([A-Z]{3,9}\.?\s+[0-9]{1,2},?\s+[0-9]{4})/i,
  /EFFECTIVE\s*DATE[\s\S]{0,80}?EXPIRATION\s*DATE\s*MO\.?\s*[0-9]{1,2}\s*DAY\s*[0-9]{1,2}\s*YR\.?\s*[0-9]{2,4}[\s\S]{0,40}?MO\.?\s*([0-9]{1,2})\s*DAY\s*([0-9]{1,2})\s*YR\.?\s*([0-9]{2,4})/i,
];

function parseFlexibleDate(raw: string): Date | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  const MONTH_MAP: Record<string, number> = {
    JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3,
    APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7,
    AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
    OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
  };

  const alpha = cleaned.match(
    /^([A-Z]{3,9})\.?\s+([0-9]{1,2}),?\s+([0-9]{4})$/i
  );
  if (alpha) {
    const month = MONTH_MAP[alpha[1].toUpperCase()];
    const day = parseInt(alpha[2], 10);
    const year = parseInt(alpha[3], 10);
    if (month && day >= 1 && day <= 31 && year >= 1940 && year <= 2100) {
      return new Date(year, month - 1, day, 23, 59, 59);
    }
  }

  const numeric = cleaned.match(/^([0-9]{1,2})[\/\-\.]([0-9]{1,2})[\/\-\.]([0-9]{2,4})$/);
  if (numeric) {
    let month = parseInt(numeric[1], 10);
    let day = parseInt(numeric[2], 10);
    let year = parseInt(numeric[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1940 && year <= 2100) {
      return new Date(year, month - 1, day, 23, 59, 59);
    }
  }

  return null;
}

function extractExpirationDate(text: string): { date: Date | null; raw: string | null; details: string[] } {
  const details: string[] = [];
  for (const pattern of EXPIRY_FIELD_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    if (match.length >= 4 && match[2] && match[3] && /^\d+$/.test(match[1]) && /^\d+$/.test(match[2])) {
      // MO DAY YR form
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      let year = parseInt(match[3], 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day, 23, 59, 59);
        details.push(`Found expiration: ${month}/${day}/${year}`);
        return { date, raw: `${month}/${day}/${year}`, details };
      }
    }

    const raw = match[1];
    const date = parseFlexibleDate(raw);
    if (date) {
      details.push(`Found expiration: ${raw}`);
      return { date, raw, details };
    }
    details.push(`Unparseable expiration value: ${raw}`);
  }
  return { date: null, raw: null, details };
}

function isPdfPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".pdf";
}

async function getTextFromDocument(
  filePath: string
): Promise<{
  text: string;
  confidence: number;
  quality: { earned: number; total: number; details: string[] };
  source: "pdf-text" | "ocr";
  cleanupPaths: string[];
}> {
  if (!isPdfPath(filePath)) {
    const quality = await analyzeImageQuality(filePath);
    const { text, confidence } = await runOCR(filePath);
    return { text, confidence, quality, source: "ocr", cleanupPaths: [] };
  }

  const { extractPdfText, renderPdfPageToPng } = await import(
    "../utils/pdf-utils"
  );
  const embedded = await extractPdfText(filePath);
  if (embedded.trim().length >= 80) {
    return {
      text: embedded.trim(),
      confidence: 90,
      quality: {
        earned: 25,
        total: 30,
        details: ["PDF contains embedded machine-readable text"],
      },
      source: "pdf-text",
      cleanupPaths: [],
    };
  }

  const previewPaths: string[] = [];
  const texts: string[] = [];
  let confidenceSum = 0;
  let confCount = 0;
  let quality = {
    earned: 0,
    total: 30,
    details: ["Could not render PDF page for OCR"] as string[],
  };

  // OCR up to first 3 pages so return/rejection notices on page 2+ are visible.
  const maxPages = 3;
  for (let page = 1; page <= maxPages; page += 1) {
    const previewPath = `${filePath}.ocr-preview-p${page}.png`;
    const rendered = await renderPdfPageToPng(filePath, previewPath, page);
    if (!rendered) {
      break;
    }
    previewPaths.push(previewPath);
    if (page === 1) {
      quality = await analyzeImageQuality(previewPath);
    }
    const { text, confidence } = await runOCR(previewPath);
    if (text.trim()) {
      texts.push(text.trim());
      confidenceSum += confidence;
      confCount += 1;
    }
  }

  if (previewPaths.length === 0) {
    return {
      text: "",
      confidence: 0,
      quality,
      source: "ocr",
      cleanupPaths: [],
    };
  }

  return {
    text: texts.join("\n\n"),
    confidence: confCount ? confidenceSum / confCount : 0,
    quality,
    source: "ocr",
    cleanupPaths: previewPaths,
  };
}

function scoreStatus(
  trustScore: number,
  messageVerified: string,
  messagePending: string,
  messageRejected: string
): { userStatus: "verified" | "pending" | "rejected"; message: string } {
  if (trustScore >= 45) {
    return { userStatus: "verified", message: messageVerified };
  }
  if (trustScore >= 25) {
    return { userStatus: "pending", message: messagePending };
  }
  return { userStatus: "rejected", message: messageRejected };
}

export class DocumentVerificationService {
  /**
   * Run the full multi-signal verification pipeline against a saved
   * government-issued ID image.
   */
  static async verifyDocument(filePath: string, docTypeHint?: string): Promise<VerificationAnalysis> {
    const errorFlags: string[] = [];

    // Stage 1: image quality
    const quality = await analyzeImageQuality(filePath);

    // Stage 2: OCR
    const { text: ocrText, confidence } = await runOCR(filePath);
    const textFound = ocrText.length > 0;
    const textLength = ocrText.length;

    let ocrEarned = 0;
    const ocrDetails: string[] = [];

    if (textFound) {
      ocrEarned += 10;
      ocrDetails.push(`OCR extracted ${textLength} characters (confidence ${Math.round(confidence)}%)`);
    } else {
      ocrDetails.push("No text extracted from image");
    }

    const usKeywordHits = countKeywordHits(ocrText, US_ID_KEYWORDS);
    const fakeSignalHits = countKeywordHits(ocrText, FAKE_SIGNAL_KEYWORDS);

    if (usKeywordHits >= 2) {
      ocrEarned += 15;
      ocrDetails.push(`Found ${usKeywordHits} US government ID indicators`);
    } else if (usKeywordHits === 1) {
      ocrEarned += 8;
      ocrDetails.push("Found 1 US government ID indicator");
    } else {
      ocrDetails.push("No US government ID indicators found");
    }

    const dobMatch = ocrText.match(DOB_PATTERN);
    const expiryMatch = ocrText.match(EXPIRY_PATTERN);
    const idNumberMatch = ocrText.match(ID_NUMBER_PATTERN);

    if (dobMatch) {
      ocrEarned += 5;
      ocrDetails.push(`Found date of birth: ${dobMatch[2]}`);
    } else if (GENERAL_DATE_PATTERN.test(ocrText)) {
      ocrEarned += 3;
      ocrDetails.push("Found a date field");
    }
    if (expiryMatch) {
      ocrEarned += 5;
      ocrDetails.push(`Found expiration: ${expiryMatch[2]}`);
    }
    if (idNumberMatch) {
      ocrEarned += 5;
      ocrDetails.push(`Found ID number pattern: ${idNumberMatch[2]}`);
    }

    if (fakeSignalHits >= 2) {
      errorFlags.push(`Document contains fake/novelty indicators: ${fakeSignalHits} found`);
      ocrEarned -= 15;
      ocrDetails.push(`FAKE INDICATORS FOUND: ${fakeSignalHits}`);
    }

    const docType = detectDocumentType(ocrText);
    let docValidationEarned = 0;
    const docDetails: string[] = [];

    const stateHits = US_STATES.filter((s) => ocrText.toUpperCase().includes(s));
    const stateCodeMatches = ocrText.match(/\b[A-Z]{2}\b/g) || [];
    const validStateCodes = stateCodeMatches.filter((c) => US_STATE_CODES.includes(c.toUpperCase()));

    if (stateHits.length > 0) {
      docValidationEarned += 10;
      docDetails.push(`Found state: ${stateHits.join(", ")}`);
    } else if (validStateCodes.length > 0) {
      docValidationEarned += 6;
      docDetails.push(`Found state code: ${validStateCodes.join(", ")}`);
    }

    const { validCount, details: dateDetails } = validateDatesInText(ocrText);
    if (validCount >= 1) {
      docValidationEarned += 8;
      docDetails.push(`Validated ${validCount} date field(s)`);
    } else if (GENERAL_DATE_PATTERN.test(ocrText)) {
      docValidationEarned += 3;
      docDetails.push(`Dates found but not all valid: ${dateDetails.join("; ")}`);
    }

    if (docType === "passport") {
      const mrzResult = validateMRZ(ocrText);
      if (mrzResult.valid) {
        docValidationEarned += 10;
        docDetails.push("Passport MRZ check digits validated successfully");
      } else {
        docValidationEarned += 3;
        docDetails.push(...mrzResult.details);
      }
    }

    if (docType === "driver_license") {
      docValidationEarned += 4;
      docDetails.push("Document identified as a driver's license");
    } else if (docType === "state_id_notice") {
      docValidationEarned += 3;
      docDetails.push("Document has state identification indicators");
    } else if (docType === "unknown" && textFound) {
      errorFlags.push("Could not classify the document type from OCR text");
    }

    const trustScore = Math.max(
      0,
      Math.min(100, quality.earned + ocrEarned + docValidationEarned)
    );

    let userStatus: "verified" | "pending" | "rejected";
    let message: string;

    if (trustScore >= 45) {
      userStatus = "verified";
      message = "Document passed automated verification.";
    } else if (trustScore >= 25) {
      userStatus = "pending";
      message = "Document could not be fully verified automatically. It will require manual review.";
    } else {
      userStatus = "rejected";
      message = "Document could not be validated as an authentic US government-issued photo ID.";
    }

    if (fakeSignalHits >= 3 && trustScore < 40) {
      userStatus = "rejected";
      message = "Document contains indicators of being a non-authentic or novelty ID.";
    }

    return {
      userStatus,
      trustScore,
      message,
      errorFlags,
      checks: {
        imageQuality: {
          passed: quality.earned >= quality.total * 0.5,
          earned: quality.earned,
          total: quality.total,
          details: quality.details,
        },
        textDetection: {
          passed: ocrEarned >= 20,
          earned: Math.max(0, ocrEarned),
          total: 45,
          details: ocrDetails,
        },
        documentValidation: {
          passed: docValidationEarned >= 15,
          earned: Math.max(0, docValidationEarned),
          total: 25,
          details: docDetails,
        },
      },
    };
  }

  static async verifyDocumentAtPath(relativePath: string): Promise<VerificationAnalysis | null> {
    const fullPath = path.join(process.cwd(), "uploads", relativePath);
    try {
      await fs.access(fullPath);
    } catch {
      return null;
    }
    return this.verifyDocument(fullPath);
  }

  /**
   * Professional license verification (cosmetology / esthetics / barber / salon /
   * appearance enhancement / CE provider licenses from sample set).
   */
  static async verifyProfessionalLicense(
    filePath: string
  ): Promise<VerificationAnalysis> {
    const errorFlags: string[] = [];
    let cleanupPaths: string[] = [];

    try {
      const extracted = await getTextFromDocument(filePath);
      cleanupPaths = extracted.cleanupPaths;
      const quality = extracted.quality;
      const ocrText = extracted.text;
      const confidence = extracted.confidence;

      let ocrEarned = 0;
      const ocrDetails: string[] = [];

      if (ocrText.length > 0) {
        ocrEarned += 10;
        ocrDetails.push(
          `Extracted ${ocrText.length} characters (${extracted.source}, confidence ${Math.round(confidence)}%)`
        );
      } else {
        ocrDetails.push("No text extracted from document");
      }

      const keywordHits = countKeywordHits(ocrText, PROFESSIONAL_LICENSE_KEYWORDS);
      if (keywordHits >= 4) {
        ocrEarned += 20;
        ocrDetails.push(`Found ${keywordHits} professional license indicators`);
      } else if (keywordHits >= 2) {
        ocrEarned += 12;
        ocrDetails.push(`Found ${keywordHits} professional license indicators`);
      } else if (keywordHits === 1) {
        ocrEarned += 5;
        ocrDetails.push("Found 1 professional license indicator");
      } else {
        ocrDetails.push("No professional license indicators found");
        return {
          userStatus: "rejected",
          trustScore: Math.max(0, quality.earned + Math.max(0, ocrEarned)),
          message:
            "This document does not appear to be a professional license. Please upload a clear photo of your state board / professional license.",
          errorFlags: ["No professional license indicators found"],
          checks: {
            imageQuality: {
              passed: quality.earned >= quality.total * 0.5,
              earned: quality.earned,
              total: quality.total,
              details: quality.details,
            },
            textDetection: {
              passed: false,
              earned: Math.max(0, ocrEarned),
              total: 45,
              details: ocrDetails,
            },
            documentValidation: {
              passed: false,
              earned: 0,
              total: 25,
              details: ["Rejected: not a professional license document"],
            },
          },
        };
      }

      const placeholderHits = countKeywordHits(
        ocrText,
        PROFESSIONAL_PLACEHOLDER_SIGNALS
      );
      if (placeholderHits > 0) {
        return {
          userStatus: "rejected",
          trustScore: Math.max(0, quality.earned + Math.max(0, ocrEarned - 20)),
          message:
            "This looks like a blank or template license. Please upload your real, filled professional license.",
          errorFlags: ["Document contains placeholder/template fields"],
          checks: {
            imageQuality: {
              passed: quality.earned >= quality.total * 0.5,
              earned: quality.earned,
              total: quality.total,
              details: quality.details,
            },
            textDetection: {
              passed: false,
              earned: Math.max(0, ocrEarned - 20),
              total: 45,
              details: [
                ...ocrDetails,
                `Placeholder signals found: ${placeholderHits}`,
              ],
            },
            documentValidation: {
              passed: false,
              earned: 0,
              total: 25,
              details: ["Rejected: template/placeholder license"],
            },
          },
        };
      }

      let docValidationEarned = 0;
      const docDetails: string[] = [];

      const licenseMatch = ocrText.match(LICENSE_NUMBER_PATTERN);
      if (licenseMatch) {
        docValidationEarned += 10;
        docDetails.push(`Found license number: ${licenseMatch[1].trim()}`);
      } else if (/\b[A-Z]{1,4}\d{4,10}\b/.test(ocrText.toUpperCase())) {
        docValidationEarned += 4;
        docDetails.push("Found license-number-like identifier");
      }

      const upper = ocrText.toUpperCase();
      if (
        /ESTHETICIAN|COSMETOLOGIST|COSMETOLOGY|BARBER|APPEARANCE ENHANCEMENT|NAIL|CE PROVIDER/.test(
          upper
        )
      ) {
        docValidationEarned += 8;
        docDetails.push("Profession / license type identified");
      }

      const expiry = extractExpirationDate(ocrText);
      docDetails.push(...expiry.details);

      if (expiry.date && expiry.date.getTime() < Date.now()) {
        return {
          userStatus: "rejected",
          trustScore: Math.max(
            0,
            Math.min(100, quality.earned + ocrEarned + docValidationEarned)
          ),
          message:
            "Your document is expired. Please upload a currently valid professional license.",
          errorFlags: [...errorFlags, `Expired on ${expiry.raw}`],
          checks: {
            imageQuality: {
              passed: quality.earned >= quality.total * 0.5,
              earned: quality.earned,
              total: quality.total,
              details: quality.details,
            },
            textDetection: {
              passed: ocrEarned >= 20,
              earned: Math.max(0, ocrEarned),
              total: 45,
              details: ocrDetails,
            },
            documentValidation: {
              passed: false,
              earned: Math.max(0, docValidationEarned),
              total: 25,
              details: docDetails,
            },
          },
        };
      }

      if (expiry.date) {
        docValidationEarned += 7;
      }

      const trustScore = Math.max(
        0,
        Math.min(100, quality.earned + ocrEarned + docValidationEarned)
      );
      const { userStatus, message } = scoreStatus(
        trustScore,
        "Professional license passed automated verification.",
        "Professional license could not be fully verified automatically. It will require manual review.",
        "Document could not be validated as an authentic professional license."
      );

      return {
        userStatus,
        trustScore,
        message,
        errorFlags,
        checks: {
          imageQuality: {
            passed: quality.earned >= quality.total * 0.5,
            earned: quality.earned,
            total: quality.total,
            details: quality.details,
          },
          textDetection: {
            passed: ocrEarned >= 20,
            earned: Math.max(0, ocrEarned),
            total: 45,
            details: ocrDetails,
          },
          documentValidation: {
            passed: docValidationEarned >= 10,
            earned: Math.max(0, docValidationEarned),
            total: 25,
            details: docDetails,
          },
        },
      };
    } finally {
      for (const p of cleanupPaths) {
        await fs.unlink(p).catch(() => {});
      }
    }
  }

  /**
   * Business document verification for EIN (IRS CP 575) and LLC/formation certificates.
   */
  static async verifyBusinessDocument(
    filePath: string
  ): Promise<VerificationAnalysis> {
    const errorFlags: string[] = [];
    let cleanupPaths: string[] = [];

    try {
      const extracted = await getTextFromDocument(filePath);
      cleanupPaths = extracted.cleanupPaths;
      const quality = extracted.quality;
      const ocrText = extracted.text;
      const confidence = extracted.confidence;
      const upper = ocrText.toUpperCase();

      let ocrEarned = 0;
      const ocrDetails: string[] = [];

      if (ocrText.length > 0) {
        ocrEarned += 10;
        ocrDetails.push(
          `Extracted ${ocrText.length} characters (${extracted.source}, confidence ${Math.round(confidence)}%)`
        );
      } else {
        ocrDetails.push("No text extracted from document");
      }

      // Hard reject example/sample EIN letters immediately.
      if (/EXAMPLE ONLY/.test(upper)) {
        return {
          userStatus: "rejected",
          trustScore: Math.max(0, quality.earned),
          message:
            "This appears to be an example/sample IRS letter. Please upload your real EIN confirmation (CP 575) letter.",
          errorFlags: ["Document contains EXAMPLE ONLY sample markers"],
          checks: {
            imageQuality: {
              passed: quality.earned >= quality.total * 0.5,
              earned: quality.earned,
              total: quality.total,
              details: quality.details,
            },
            textDetection: {
              passed: false,
              earned: 0,
              total: 45,
              details: ocrDetails.concat(["EXAMPLE ONLY marker found"]),
            },
            documentValidation: {
              passed: false,
              earned: 0,
              total: 25,
              details: ["Rejected: sample/example EIN letter"],
            },
          },
        };
      }

      const einHits = countKeywordHits(ocrText, EIN_KEYWORDS);
      const llcHits = countKeywordHits(ocrText, LLC_KEYWORDS);
      const isEinLike = einHits >= 2 || /WE ASSIGNED YOU AN EMPLOYER IDENTIFICATION NUMBER/.test(upper);
      const isLlcLike =
        llcHits >= 2 ||
        /CERTIFICATE OF FORMATION|ARTICLES OF ORGANIZATION|CERTIFICATE OF ORGANIZATION/.test(
          upper
        );

      let docKind: "ein" | "llc" | "unknown" = "unknown";
      if (isEinLike && (!isLlcLike || einHits >= llcHits)) {
        docKind = "ein";
      } else if (isLlcLike) {
        docKind = "llc";
      }

      if (isEinLike && isLlcLike) {
        ocrDetails.push(
          `Mixed business signals detected (EIN indicators=${einHits}, LLC indicators=${llcHits})`
        );
      }

      let docValidationEarned = 0;
      const docDetails: string[] = [];

      if (docKind === "ein" || (isEinLike && isLlcLike)) {
        ocrEarned += Math.min(20, einHits * 4);
        ocrDetails.push(`EIN/IRS indicators: ${einHits}`);

        const fakeHits = countKeywordHits(ocrText, EIN_FAKE_SIGNALS);
        if (fakeHits > 0) {
          errorFlags.push("Document contains example/sample EIN indicators");
          ocrEarned -= 25;
          ocrDetails.push(`Fake/example signals: ${fakeHits}`);
        }

        const einMatch =
          ocrText.match(EIN_NUMBER_PATTERN) ||
          ocrText.match(EIN_NUMBER_LOOSE_PATTERN);
        if (einMatch) {
          docValidationEarned += 12;
          docDetails.push(`Found EIN: ${einMatch[1].replace(/\s+/g, "")}`);
        } else {
          docDetails.push("No EIN number pattern found");
        }

        if (/CP\s*575/.test(upper) || /FORM[:\s]*SS-4/.test(upper)) {
          docValidationEarned += 8;
          docDetails.push("IRS CP 575 / SS-4 form markers found");
        }
      }

      if (docKind === "llc" || (isLlcLike && !isEinLike)) {
        ocrEarned += Math.min(20, llcHits * 3);
        ocrDetails.push(`LLC/formation indicators: ${llcHits}`);

        const rejectHits = countKeywordHits(ocrText, LLC_REJECT_SIGNALS);
        if (rejectHits > 0 || /HAS NOT BEEN FILED/.test(upper)) {
          return {
            userStatus: "rejected",
            trustScore: Math.max(0, quality.earned + Math.max(0, ocrEarned)),
            message:
              "This document indicates the business filing was not completed or was returned. Please upload an approved Certificate of Formation / Articles of Organization or IRS EIN letter.",
            errorFlags: [
              ...errorFlags,
              "Filing rejection / return language found",
            ],
            checks: {
              imageQuality: {
                passed: quality.earned >= quality.total * 0.5,
                earned: quality.earned,
                total: quality.total,
                details: quality.details,
              },
              textDetection: {
                passed: ocrEarned >= 20,
                earned: Math.max(0, ocrEarned),
                total: 45,
                details: ocrDetails,
              },
              documentValidation: {
                passed: false,
                earned: 0,
                total: 25,
                details: ["Rejected: document is a return/not-filed notice"],
              },
            },
          };
        }

        if (
          /CERTIFICATE OF FORMATION|ARTICLES OF ORGANIZATION|CERTIFICATE OF ORGANIZATION/.test(
            upper
          )
        ) {
          docValidationEarned += 10;
          docDetails.push("Formation / organization certificate title found");
        }
        if (/LIMITED LIABILITY COMPANY|\bLLC\b/.test(upper)) {
          docValidationEarned += 6;
          docDetails.push("LLC entity type found");
        }
        if (
          /SECRETARY OF STATE|DIVISION OF CORPORATIONS|CORPORATIONS DIVISION|DEPARTMENT OF STATE/.test(
            upper
          )
        ) {
          docValidationEarned += 6;
          docDetails.push("State filing authority found");
        }
        if (
          /FILE\s*(?:NUMBER|NO)|FILING\s*NUMBER|CONTROL\s*NUMBER|DOCUMENT\s*(?:NUMBER|#)|SR#|ENTITY ID/i.test(
            ocrText
          )
        ) {
          docValidationEarned += 3;
          docDetails.push("Filing / control number marker found");
        }
      }

      if (docKind === "unknown") {
        ocrDetails.push("Could not classify as EIN letter or LLC formation document");
        return {
          userStatus: "rejected",
          trustScore: Math.max(0, quality.earned + Math.max(0, ocrEarned)),
          message:
            "This document does not appear to be an IRS EIN confirmation letter or LLC Certificate of Formation. Please upload one of those documents.",
          errorFlags: ["Unrecognized business document type"],
          checks: {
            imageQuality: {
              passed: quality.earned >= quality.total * 0.5,
              earned: quality.earned,
              total: quality.total,
              details: quality.details,
            },
            textDetection: {
              passed: false,
              earned: Math.max(0, ocrEarned),
              total: 45,
              details: ocrDetails,
            },
            documentValidation: {
              passed: false,
              earned: 0,
              total: 25,
              details: ["Rejected: not an EIN letter or LLC formation certificate"],
            },
          },
        };
      }

      if (docKind === "ein" && isLlcLike) {
        if (
          /CERTIFICATE OF FORMATION|ARTICLES OF ORGANIZATION|CERTIFICATE OF ORGANIZATION/.test(
            upper
          )
        ) {
          docValidationEarned += 4;
          docDetails.push("Also contains formation certificate content");
        }
      }

      const trustScore = Math.max(
        0,
        Math.min(100, quality.earned + ocrEarned + docValidationEarned)
      );
      const { userStatus, message } = scoreStatus(
        trustScore,
        "Business document passed automated verification.",
        "Business document could not be fully verified automatically. It will require manual review.",
        "Document could not be validated as an authentic IRS EIN letter or LLC formation certificate."
      );

      return {
        userStatus,
        trustScore,
        message,
        errorFlags,
        checks: {
          imageQuality: {
            passed: quality.earned >= quality.total * 0.5,
            earned: quality.earned,
            total: quality.total,
            details: quality.details,
          },
          textDetection: {
            passed: ocrEarned >= 20,
            earned: Math.max(0, ocrEarned),
            total: 45,
            details: ocrDetails,
          },
          documentValidation: {
            passed: docValidationEarned >= 10,
            earned: Math.max(0, docValidationEarned),
            total: 25,
            details: docDetails,
          },
        },
      };
    } finally {
      for (const p of cleanupPaths) {
        await fs.unlink(p).catch(() => {});
      }
    }
  }

  static async verifyProfessionalLicenseAtPath(
    relativePath: string
  ): Promise<VerificationAnalysis | null> {
    const fullPath = path.join(process.cwd(), "uploads", relativePath);
    try {
      await fs.access(fullPath);
    } catch {
      return null;
    }
    return this.verifyProfessionalLicense(fullPath);
  }

  static async verifyBusinessDocumentAtPath(
    relativePath: string
  ): Promise<VerificationAnalysis | null> {
    const fullPath = path.join(process.cwd(), "uploads", relativePath);
    try {
      await fs.access(fullPath);
    } catch {
      return null;
    }
    return this.verifyBusinessDocument(fullPath);
  }
}
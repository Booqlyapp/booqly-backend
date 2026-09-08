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
  "VOID",
  "TRAINING",
  "NOT FOR IDENTIFICATION",
  "FAKE",
  "COPY",
  "FOR DISPLAY PURPOSES",
  "NOVELTY",
  "RECREATIONAL",
  "MOVIE PROP",
  "PROP ONLY",
];

const DOB_PATTERN = /(DOB|DATE OF BIRTH|BIRTH DATE)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const EXPIRY_PATTERN = /(EXP|EXPIRES|EXPIRATION|VALID THRU|VALID TO|EXPIRATION DATE)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const GENERAL_DATE_PATTERN = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/;
const ID_NUMBER_PATTERN = /(DL|DLN|ID|LIC|LICENSE|LICENCENO|#|NO)\s*[:\-]?\s*([A-Z]{1,3}\d{2,10}|\d{5,12})/i;

const MIN_WIDTH = 300;
const MIN_HEIGHT = 180;
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
  return keywords.reduce((count, k) => (upper.includes(k) ? count + 1 : count), 0);
}

function validateDatesInText(text: string): { dates: string[]; validCount: number; details: string[] } {
  const details: string[] = [];
  const matches = text.match(/[A-Z]{2,}[0-9]{2,}/g);
  void matches;
  const allDates = text.match(GENERAL_DATE_PATTERN) || [];
  let validCount = 0;

  for (const raw of allDates) {
    const normalized = raw.replace(/[\-\.]/g, "/");
    const parts = normalized.split("/").map((p) => p);
    if (parts.length !== 3) continue;
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
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

  const mrzCandidate = lines.find(
    (l) => (l.startsWith("P<") || l.startsWith("P>") || l.startsWith("I<") || l.startsWith("V<")) && l.length >= 35
  );

  if (!mrzCandidate) {
    return { valid: false, details: ["No MRZ line found in OCR text"] };
  }

  const cleanLine = mrzCandidate.replace(/\s+/g, "");
  if (cleanLine.length < 44) {
    details.push(`MRZ line too short (${cleanLine.length} chars)`);
    return { valid: false, details };
  }

  try {
    const secondLineStart = cleanLine.substring(44, 54);
    void secondLineStart;
    const result = parse(cleanLine);
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

    if (fakeSignalHits > 0) {
      errorFlags.push(`Document contains fake/novelty indicators: ${fakeSignalHits} found`);
      ocrEarned -= 20;
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

    if (trustScore >= 70) {
      userStatus = "verified";
      message = "Document passed automated verification.";
    } else if (trustScore >= 40) {
      userStatus = "pending";
      message = "Document could not be fully verified automatically. It will require manual review.";
    } else {
      userStatus = "rejected";
      message = "Document could not be validated as an authentic US government-issued photo ID.";
    }

    if (fakeSignalHits > 0 && trustScore < 70) {
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
}
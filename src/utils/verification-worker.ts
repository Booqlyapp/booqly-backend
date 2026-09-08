// Verification Worker - Local Storage Version
// Runs the multi-signal document verification pipeline against uploaded
// government-issued ID images and updates user status in the database.

import sequelize from "../config/database";
import { initModels } from "../models/index";
import { User } from "../models/user_model";
import { localFileStorage } from "./local-storage";
import { DocumentVerificationService, VerificationAnalysis } from "../services/document-verification.service";

initModels(sequelize);

sequelize
  .authenticate()
  .then(() => {
    console.log(`✅ Worker database connected successfully`);
  })
  .catch((err: Error) => {
    console.error("❌ Worker unable to connect to the database:", err);
  });

interface DocumentBlock {
  Text?: string;
  BlockType?: string;
}

async function processLocalDocument(
  userId: string,
  filePath: string,
  docType: string
): Promise<VerificationAnalysis> {
  console.log(`Processing verification for user ${userId}, document type: ${docType}`);

  // Check if file exists
  const fileExists = await localFileStorage.fileExists(filePath);
  if (!fileExists) {
    throw new Error(`Document file not found: ${filePath}`);
  }

  // Run the real multi-signal verification pipeline
  const analysis = await DocumentVerificationService.verifyDocumentAtPath(filePath);

  if (!analysis) {
    throw new Error(`Document file not found: ${filePath}`);
  }

  // Apply the verification result to the user's account
  const user = await User.findOne({ where: { id: userId } });
  if (user) {
    await user.update({
      status: analysis.userStatus,
      accountVerified: analysis.userStatus === "verified",
    });
    console.log(
      `User ${userId} verification completed: ${analysis.userStatus} (trust score ${analysis.trustScore})`
    );
  }

  return analysis;
}

// Export functions for use in other parts of the application
export {
  processLocalDocument,
  type DocumentBlock,
  type VerificationAnalysis,
};
export { DocumentVerificationService };
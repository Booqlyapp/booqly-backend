import { Request, Response } from "express";
import { localFileStorage } from "../utils/local-storage";

// No longer needed - local files are directly accessible
export const genericSignedUrl = async (
  imagePath: string
): Promise<string | null> => {
  // For local storage, just return the path as-is since files are directly accessible
  return imagePath;
};

export const createSignedUrlForVerification = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { imageName, docType, userId } = req.body;

    // Validate incoming data
    if (!imageName || !docType || !userId) {
      return res.status(400).json({
        status: false,
        message: "Missing required parameters: imageName, docType or userId.",
      });
    }

    const allowedDocTypes = [
      "identityCard",
      "passport",
      "driversLicense",
      "cosmetology",
      "irsEin",
      "llcCertificate",
    ];
    if (!allowedDocTypes.includes(docType)) {
      return res.status(400).json({
        status: false,
        message:
          "Invalid docType. Allowed values are: identityCard, passport, driversLicense, cosmetology, irsEin, llcCertificate.",
      });
    }

    // For local storage, we'll return a direct upload URL
    const relativePath = `verification-docs/${docType}/${imageName}`;
    const uploadUrl = localFileStorage.getPublicUrl(relativePath);

    return res.status(200).json({
      status: true,
      message: "Upload URL generated successfully.",
      uploadUrl,
      relativePath,
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${err}`,
    });
  }
};

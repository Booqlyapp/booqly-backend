import { Response, NextFunction } from "express";
const jwt = require("jsonwebtoken");
import { User } from "../models/user_model";

// Define the structure of the token's payload
interface AuthTokenPayload {
  email: string;
}

const validateUser = async (req: any, res: Response, next: NextFunction) => {
  try {
    // Extract Auth-Token from Authorization header
    const authHeader = req.header("Authorization");

    // Check if Authorization header is present and correctly formatted
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("No Auth-Token provided or Invalid token format");
      return res.status(401).send("Unauthorized: No Auth-Token provided");
    }

    // Extract token from the Authorization header (after "Bearer ")
    const authToken = authHeader.split(" ")[1];

    // Log the token to ensure it's being extracted correctly
    console.log("Extracted token:", authToken);

    let decodedToken: AuthTokenPayload;
    try {
      // Verify the token using the JWT secret key
      decodedToken = jwt.verify(
        authToken,
        process.env.JWT_AUTH_KEY!
      ) as AuthTokenPayload;

      // Log the decoded token
      console.log("Decoded token:", decodedToken);
    } catch (error) {
      // Log the error from jwt.verify()
      console.error("JWT verification failed:", error);
      return res
        .status(401)
        .send(`Unauthorized: Invalid Auth-Token. Error: ${error}`);
    }

    // If token contains the email, proceed to check user in the database
    if (decodedToken && decodedToken.email) {
      // Search for the user in the database with verified status
      const profile = await User.findOne({
        where: { email: decodedToken.email, status: "verified" },
      });

      // If the user exists and is verified, attach user information to request
      if (profile) {
        req.auth = {
          id: profile.id,
          email: profile.email,
          user: profile,
        };
        // Proceed to the next middleware or route handler
        return next();
      } else {
        // If user is not found or not verified, return unauthorized error
        return res
          .status(401)
          .send("Unauthorized: User not verified or not found");
      }
    }

    // If the token is valid but email is missing, return unauthorized error
    return res.status(401).send("Unauthorized: Invalid email in token");
  } catch (err: any) {
    // Log and handle unexpected errors in the middleware
    console.error("Middleware Authentication Error:", err);
    return res.status(500).send("Internal Server Error");
  }
};

export default validateUser;

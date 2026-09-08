import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const config = {
  username: isProduction ? process.env.PROD_DB_USERNAME : process.env.DEV_DB_USERNAME,
  password: isProduction ? process.env.PROD_DB_PASSWORD : process.env.DEV_DB_PASSWORD || "",
  database: isProduction ? process.env.PROD_DB_NAME : process.env.DEV_DB_NAME,
  host: isProduction ? process.env.PROD_DB_HOST : process.env.DEV_DB_HOST,
  port: isProduction ? process.env.PROD_DB_PORT : process.env.DEV_DB_PORT,
  dialect: "postgres",
  appPort: process.env.APP_PORT || 3000,
};

export default config;
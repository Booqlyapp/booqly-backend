import { Sequelize } from "sequelize";
import config from "./config";

const host = String(config.host || "");
const isLocalHost =
  host === "localhost" || host === "127.0.0.1" || host === "::1";

const sequelize = new Sequelize(
  config.database as string,
  config.username as string,
  config.password,
  {
    host: config.host,
    dialect: "postgres",
    port: Number(config.port),
    // Local Postgres usually has no SSL; remote hosts often require it.
    ...(isLocalHost
      ? {}
      : {
          dialectOptions: {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          },
        }),
  }
);

export default sequelize;
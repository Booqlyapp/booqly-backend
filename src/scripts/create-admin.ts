/**
 * One-off script to create (or promote) an admin account.
 * Public signup only allows client/solo/suite roles, so admin accounts
 * must be created this way instead.
 *
 * Usage:
 *   ADMIN_EMAIL=you@booqlyapp.com ADMIN_PASSWORD=SomeStrongPass1 ADMIN_NAME="Admin" npx ts-node src/scripts/create-admin.ts
 */
import bcryptjs from "bcryptjs";
import sequelize from "../config/database";
import { initModels } from "../models/index";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
    process.exit(1);
  }

  const { User } = initModels(sequelize);
  await sequelize.authenticate();

  const hashedPassword = await bcryptjs.hash(password, 8);

  const [user, created] = await User.findOrCreate({
    where: { email },
    defaults: {
      name,
      email,
      password: hashedPassword,
      role: "admin",
      status: "verified",
      accountVerified: true,
      freeBookingUsed: false,
    } as any,
  });

  if (!created) {
    await user.update({ role: "admin", password: hashedPassword, status: "verified", accountVerified: true });
    console.log(`Existing user ${email} promoted to admin.`);
  } else {
    console.log(`Admin user ${email} created.`);
  }

  await sequelize.close();
}

main().catch((error) => {
  console.error("Failed to create admin user:", error);
  process.exit(1);
});

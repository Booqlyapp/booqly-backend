import { QueryTypes, Sequelize } from "sequelize";
import { Video } from "../models/video_model";

const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const SHORT_CODE_LENGTH = 8;

const randomShortCode = (): string => {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
    code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
};

/**
 * Adds the `shortCode` column (TikTok-style reel share codes) to the Videos
 * table if it doesn't exist yet, plus a unique partial index so each short
 * code maps to exactly one reel.
 */
export async function ensureVideosShortCodeColumn(sequelize: Sequelize): Promise<void> {
  try {
    await sequelize.query(`
      ALTER TABLE "Videos" ADD COLUMN IF NOT EXISTS "shortCode" VARCHAR(16);
      CREATE UNIQUE INDEX IF NOT EXISTS "Videos_shortCode_key"
        ON "Videos" ("shortCode")
        WHERE "shortCode" IS NOT NULL;
    `);

    console.log("✅ Videos shortCode column ensured");
  } catch (error) {
    console.warn("Could not ensure Videos shortCode column:", error);
  }
}

/**
 * Backfills short codes for videos uploaded before the column existed.
 * Runs in small batches so startup isn't blocked for long.
 */
export async function backfillVideoShortCodes(
  sequelize: Sequelize,
  batchSize = 500
): Promise<void> {
  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await sequelize.query<{ id: string }>(
        `SELECT id FROM "Videos" WHERE "shortCode" IS NULL LIMIT :limit`,
        { type: QueryTypes.SELECT, replacements: { limit: batchSize } }
      );

      if (rows.length === 0) {
        break;
      }

      const seenInBatch = new Set<string>();

      for (const row of rows) {
        let code = randomShortCode();
        let attempt = 0;

        while (attempt < 5) {
          if (seenInBatch.has(code)) {
            code = randomShortCode();
            attempt += 1;
            continue;
          }

          const existing = await Video.findOne({
            where: { shortCode: code },
            attributes: ["id"],
          });

          if (!existing) {
            break;
          }

          code = randomShortCode();
          attempt += 1;
        }

        seenInBatch.add(code);

        await Video.update(
          { shortCode: code },
          { where: { id: row.id } }
        );
      }
    }
  } catch (error) {
    console.warn("Could not backfill video short codes:", error);
  }
}
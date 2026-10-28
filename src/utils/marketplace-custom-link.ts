import { Op } from "sequelize";
import { Marketplace } from "../models/marketplace_model";

const RESERVED_WORDS = [
  "api",
  "www",
  "admin",
  "app",
  "mail",
  "ftp",
  "blog",
  "shop",
  "store",
];

/**
 * Same slug rules as the Flutter Custom Booking Link screen:
 * lowercase, non-alphanumeric → hyphen, collapse hyphens, trim edges.
 */
export function slugifyBusinessName(businessName: string): string {
  let slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (slug.length > 30) {
    slug = slug.slice(0, 30).replace(/-$/g, "");
  }

  // Model requires 3–30 chars; pad short business names so create/backfill can succeed.
  if (slug.length < 3) {
    slug = `${slug || "biz"}-biz`.replace(/-+/g, "-").slice(0, 30);
  }

  return slug;
}

async function isCustomLinkTaken(
  customLink: string,
  excludeMarketplaceId?: string
): Promise<boolean> {
  if (RESERVED_WORDS.includes(customLink)) {
    return true;
  }

  const existing = await Marketplace.findOne({
    where: {
      customLink,
      ...(excludeMarketplaceId
        ? { id: { [Op.ne]: excludeMarketplaceId } }
        : {}),
    },
    attributes: ["id"],
  });

  return !!existing;
}

/**
 * Returns a unique customLink derived from businessName (adds -2, -3, … if needed).
 */
export async function allocateUniqueCustomLink(
  businessName: string,
  excludeMarketplaceId?: string
): Promise<string> {
  const base = slugifyBusinessName(businessName);
  let candidate = base;
  let suffix = 2;

  while (await isCustomLinkTaken(candidate, excludeMarketplaceId)) {
    const suffixStr = `-${suffix}`;
    const maxBaseLen = Math.max(3, 30 - suffixStr.length);
    candidate = `${base.slice(0, maxBaseLen)}${suffixStr}`;
    suffix += 1;
    if (suffix > 1000) {
      candidate = `biz-${Date.now().toString(36)}`.slice(0, 30);
      break;
    }
  }

  return candidate;
}

/**
 * Backfill Marketplaces.customLink for rows that never had one saved.
 * Matches the slug the app already shows from businessName so public URLs work.
 */
export async function backfillMarketplaceCustomLinks(
  batchSize = 100
): Promise<void> {
  try {
    let filled = 0;
    const skippedIds: string[] = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await Marketplace.findAll({
        where: {
          customLink: null,
          ...(skippedIds.length > 0
            ? { id: { [Op.notIn]: skippedIds } }
            : {}),
        },
        attributes: ["id", "businessName"],
        limit: batchSize,
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        const name = row.businessName?.trim();
        if (!name) {
          skippedIds.push(row.id);
          continue;
        }

        try {
          const customLink = await allocateUniqueCustomLink(name, row.id);
          const [updated] = await Marketplace.update(
            { customLink },
            { where: { id: row.id, customLink: null } }
          );
          if (updated > 0) {
            filled += 1;
          } else {
            skippedIds.push(row.id);
          }
        } catch {
          skippedIds.push(row.id);
        }
      }
    }

    if (filled > 0) {
      console.log(`✅ Backfilled customLink for ${filled} marketplace(s)`);
    }
  } catch (error) {
    console.warn("Could not backfill marketplace customLink:", error);
  }
}

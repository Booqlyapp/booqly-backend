/**
 * One-off E2E helper: grant client_premium to a specific user on prod DB.
 * Same approach used for farahshammen@gmail.com. Delete after use.
 * Does not print secrets.
 */
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(PROD_DB_[A-Z]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const env = loadEnv(path.join(__dirname, '..', '.env'));
  const userId = process.argv[2];
  const host = process.argv[3] || '187.77.98.183';
  if (!userId) throw new Error('userId required');

  const client = new Client({
    host,
    port: Number(env.PROD_DB_PORT || 5432),
    user: env.PROD_DB_USERNAME,
    password: env.PROD_DB_PASSWORD,
    database: env.PROD_DB_NAME,
    ssl: false,
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  const before = await client.query(
    'SELECT email, "currentSubscriptionId", status, "identityVerified", "referredBy", "referralCode", "freeBookingUsed" FROM "Users" WHERE id = $1',
    [userId]
  );
  console.log('BEFORE', JSON.stringify(before.rows[0] || null));
  if (!before.rows[0]) throw new Error('user not found');

  const existing = await client.query(
    `SELECT id, "planType", status FROM "Subscriptions"
     WHERE "userId" = $1 AND "planType" = 'client_premium' AND status IN ('active','trialing')
     ORDER BY "createdAt" DESC LIMIT 1`,
    [userId]
  );

  let subId;
  if (existing.rows[0]) {
    subId = existing.rows[0].id;
    console.log('REUSE_SUB', JSON.stringify(existing.rows[0]));
  } else {
    subId = crypto.randomUUID();
    const start = new Date();
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    await client.query(
      `INSERT INTO "Subscriptions"
        (id, "userId", "planType", status, "currentPeriodStart", "currentPeriodEnd",
         "cancelAtPeriodEnd", metadata, "createdAt", "updatedAt")
       VALUES ($1,$2,'client_premium','active',$3,$4,false,$5,NOW(),NOW())`,
      [
        subId,
        userId,
        start,
        end,
        JSON.stringify({
          source: 'e2e_manual_grant',
          email: before.rows[0].email,
        }),
      ]
    );
    console.log('INSERTED_SUB', subId);
  }

  // Match Farah setup: attach sub + verified account (no referral).
  await client.query(
    `UPDATE "Users"
     SET "currentSubscriptionId" = $1,
         status = 'verified',
         "accountVerified" = true,
         "identityVerified" = true,
         "referredBy" = NULL,
         "referralCode" = NULL,
         "updatedAt" = NOW()
     WHERE id = $2`,
    [subId, userId]
  );

  const after = await client.query(
    'SELECT email, "currentSubscriptionId", status, "identityVerified", "referredBy", "referralCode" FROM "Users" WHERE id = $1',
    [userId]
  );
  const sub = await client.query(
    'SELECT id, "planType", status, "currentPeriodEnd" FROM "Subscriptions" WHERE id = $1',
    [subId]
  );
  console.log('AFTER', JSON.stringify({ user: after.rows[0], sub: sub.rows[0] }));
  await client.end();
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});

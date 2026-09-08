-- Check existing referral codes
SELECT 
    id,
    name,
    email,
    role,
    "referralCode",
    "createdAt"
FROM users
WHERE "referralCode" IS NOT NULL
ORDER BY "createdAt" DESC;

-- Check all providers (solo/suite) to see who can have referral codes
SELECT 
    id,
    name,
    email,
    role,
    "referralCode",
    "currentSubscriptionId"
FROM users
WHERE role IN ('solo', 'suite')
ORDER BY "createdAt" DESC
LIMIT 10;

-- Check existing referrals
SELECT 
    r.id,
    r."referralCode",
    r.status,
    r."createdAt",
    referrer.name as "referrerName",
    referred.name as "referredName"
FROM referrals r
LEFT JOIN users referrer ON r."referrerId" = referrer.id
LEFT JOIN users referred ON r."referredUserId" = referred.id
ORDER BY r."createdAt" DESC
LIMIT 10;

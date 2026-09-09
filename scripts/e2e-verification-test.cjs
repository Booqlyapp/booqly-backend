/**
 * E2E verification flow test – API level.
 *
 * Boots the REAL compiled routers (dist/routes/user_route.js, marketplace_route.js)
 * with real multer, real JWT auth, real DocumentVerificationService OCR scoring,
 * and real file storage. ONLY the sequelize model/service modules are replaced
 * with in-memory fakes (no Postgres is available on this machine).
 *
 * Covers: client, solo professional, and suite owner verification, plus the
 * public marketplace profile exposure of verification badge fields.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const assert = require("assert");

process.env.NODE_ENV = "test";
require("dotenv").config();

if (!process.env.JWT_SECRET_KEY) {
  throw new Error("JWT_SECRET_KEY not loaded from .env");
}

const distDir = path.resolve(__dirname, "..", "dist");
const FIX_DIR = path.join(
  process.env.LOCALAPPDATA || process.env.TEMP,
  "opencode",
  "e2e-fixtures"
);

// ---------------------------------------------------------------------------
// In-memory DB fakes
// ---------------------------------------------------------------------------
const state = {
  user: null,
  marketplace: null,
  notifications: [],
  socialUpdates: [],
  userUpdates: [],
};

function makeInstance(data) {
  const backing = { ...data };
  const inst = { ...backing };
  inst.update = async (fields) => {
    for (const k of Object.keys(fields)) {
      backing[k] = fields[k];
      inst[k] = fields[k];
    }
    return inst;
  };
  inst.save = async () => inst;
  inst.reload = async () => inst;
  inst.toJSON = () => ({ ...backing });
  inst.get = (k) => backing[k];
  inst.destroy = async () => inst;
  return inst;
}

function makeMarketplace(over = {}) {
  const data = {
    id: "mkt-test-1",
    userId: state.user ? state.user.id : null,
    businessName: "Test & Glow Salon",
    imagesList: [],
    latitude: null,
    longitude: null,
    user: state.user,
    services: [],
    reviews: [],
    ...over,
  };
  const inst = makeInstance(data);
  if (over.user) state.user = over.user;
  return inst;
}

function inertModel() {
  const m = function Model() {};
  m.rawAttributes = {};
  m.sequelize = {};
  m.findOne = async () => null;
  m.findByPk = async () => null;
  m.findAll = async () => [];
  m.findAndCountAll = async () => ({ count: 0, rows: [] });
  m.update = async () => [1];
  m.create = (f) => makeInstance(f);
  m.bulkCreate = async () => [];
  m.count = async () => 0;
  m.upsert = (f) => makeInstance(f);
  return m;
}

const User = inertModel();
User.findOne = async () => state.user;
User.findByPk = async () => state.user;
User.findAll = async () => (state.user ? [state.user] : []);
User.findAndCountAll = async () => ({
  count: state.user ? 1 : 0,
  rows: state.user ? [state.user] : [],
});
User.update = async (fields) => {
  if (state.user) {
    for (const k of Object.keys(fields)) state.user[k] = fields[k];
  }
  state.userUpdates.push(fields);
  return [1];
};
User.count = async () => (state.user ? 1 : 0);

const Marketplace = inertModel();
Marketplace.findOne = async () => state.marketplace;
Marketplace.findByPk = async () => state.marketplace;
Marketplace.findAll = async () =>
  state.marketplace ? [state.marketplace] : [];
Marketplace.findAndCountAll = async () => ({
  count: state.marketplace ? 1 : 0,
  rows: state.marketplace ? [state.marketplace] : [],
});

const Social = inertModel();
Social.update = async (fields) => {
  state.socialUpdates.push(fields);
  return [1];
};

const Subscription = inertModel();

function inject(relativeFile, exp) {
  const abs = path.resolve(distDir, relativeFile);
  require.cache[abs] = {
    id: abs,
    filename: abs,
    loaded: true,
    exports: exp,
    children: [],
    paths: [],
  };
  return exp;
}

const MODEL_FILES = [
  ["user_model", "User", User],
  ["marketplace_model", "Marketplace", Marketplace],
  ["social_model", "Social", Social],
  ["subscription_model", "Subscription", Subscription],
  ["subscription_plan_model", "SubscriptionPlan"],
  ["appointment_model", "Appointment"],
  ["appointment_service_status_model", "AppointmentServiceStatus"],
  ["schedule_model", "Schedule"],
  ["service_model", "Service"],
  ["service_addon_model", "ServiceAddOn"],
  ["review_model", "Review"],
  ["review_flag_model", "ReviewFlag"],
  ["conversation_model", "Conversation"],
  ["message_model", "Message"],
  ["notification_model", "Notification"],
  ["referral_model", "Referral"],
  ["referral_invite_model", "ReferralInvite"],
  ["log_model", "Log"],
  ["category_model", "Category"],
  ["subcategory_model", "Subcategory"],
  ["promotion_model", "Promotion"],
  ["friend_model", "Friend"],
  ["external_appointment_model", "ExternalAppointment"],
  ["waitlist_model", "Waitlist"],
  ["video_model", "Video"],
  ["video_like_model", "VideoLike"],
  ["video_comment_model", "VideoComment"],
  ["video_comment_reaction_model", "VideoCommentReaction"],
  ["video_follow_model", "VideoFollow"],
  ["team_member_permission_model", "TeamMemberPermission"],
  ["content_report_model", "ContentReport"],
  ["announcement_model", "Announcement"],
  ["support_ticket_model", "SupportTicket"],
  ["support_ticket_message_model", "SupportTicketMessage"],
];

for (const [file, key, model] of MODEL_FILES) {
  const cls = model || inertModel();
  inject(`models/${file}.js`, { default: () => {}, [key]: cls });
}

inject("services/notification.service.js", {
  NotificationService: {
    createNotification: async (d) => {
      state.notifications.push({ ...d, notificationId: "test-notif" });
      return { id: "test-notif" };
    },
    sendEmail: async () => {},
  },
});
inject("services/subscription.service.js", {
  SubscriptionService: {
    canClientDiscoverProviders: async () => ({ canDiscover: true, reason: null }),
    getUserSubscriptionInfo: async () => ({ hasActiveSubscription: true, planType: "pro" }),
    hasFeatureAccess: async () => true,
  },
});
inject("services/referral.service.js", {
  ReferralService: { isClientReferredToProvider: async () => false },
});
inject("services/review.service.js", { ReviewService: {} });
inject("services/stripe.service.js", { StripeService: {} });
inject("services/iap.service.js", { IapService: {} });

// ---------------------------------------------------------------------------
// Boot real routers
// ---------------------------------------------------------------------------
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const userRouter = require(path.join(distDir, "routes", "user_route.js")).default;
const marketplaceRouter = require(path.join(
  distDir,
  "routes",
  "marketplace_route.js"
)).default;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/user", userRouter);
app.use("/marketplace", marketplaceRouter);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const { createCanvas } = require("@napi-rs/canvas");

fs.mkdirSync(FIX_DIR, { recursive: true });

function drawDoc(out, w, h, opts = {}) {
  const lines = opts.lines || [
    "STATE OF CALIFORNIA  DRIVER LICENSE",
    "NAME: JOHN A. DOE",
    "DOB: 05/14/1990",
    "EXP: 05/14/2030",
    "DL: D1234567",
  ];
  const cv = createCanvas(w, h);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = opts.bg || "#e8eef5";
  ctx.fillRect(0, 0, w, h);
  if (!opts.blank) {
    ctx.fillStyle = opts.color || "#123c7a";
    ctx.font = `${Math.max(14, Math.round(h / 12))}px Arial`;
    lines.forEach((ln, i) => ctx.fillText(ln, 20, 40 + i * (h / (lines.length + 1))));
  }
  fs.writeFileSync(out, cv.toBuffer("image/png"));
}

const dlPath = path.join(FIX_DIR, "dl.png"); // 900x560 real-ish license
const ppPath = path.join(FIX_DIR, "pp.png"); // 900x640 passport
const weakPath = path.join(FIX_DIR, "weak.png"); // 250x160 "normal quality"
const m1Path = path.join(FIX_DIR, "m1.png"); // 500x420 faint/incomplete doc
const tinyPath = path.join(FIX_DIR, "tiny.png"); // 200x150 below minimum
const blankPath = path.join(FIX_DIR, "blank.png"); // 400x400 no content

drawDoc(dlPath, 900, 560);
drawDoc(
  ppPath,
  900,
  640,
  { lines: ["UNITED STATES OF AMERICA  PASSPORT", "Passport No 123456789", "Surname DOE", "Given Name JOHN ADAM", "DOB 02/15/1985"] }
);
drawDoc(weakPath, 250, 160);
{
  const cv = createCanvas(500, 420);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, 500, 420);
  ctx.fillStyle = "#8a8f99";
  ctx.font = "22px Arial";
  ctx.fillText("JOHN DOE", 15, 56);
  ctx.fillText("DOB 1990", 15, 82);
  fs.writeFileSync(m1Path, cv.toBuffer("image/png"));
}
drawDoc(tinyPath, 200, 150);
drawDoc(blankPath, 400, 400, { blank: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let failures = 0;
function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail || ""}`);
  if (!ok) failures += 1;
}

function setUser(role, over = {}) {
  const data = {
    id: `usr-${role}-test`,
    role,
    name: "Test User",
    email: `${role}@test.local`,
    phone: "9995550100",
    status: "unverified",
    isSuspended: false,
    accountVerified: false,
    identityVerified: false,
    professionalVerified: false,
    businessVerified: false,
    identityDocumentUrl: null,
    professionalDocumentUrl: null,
    professionalLicenseType: null,
    businessDocumentUrl: null,
    currentSubscriptionId: null,
    ...over,
  };
  state.user = makeInstance(data);
  state.marketplace = makeMarketplace();
  state.notifications = [];
  state.socialUpdates = [];
  return state.user;
}

function auth() {
  const token = jwt.sign({ id: state.user.id }, process.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
  });
  return { Authorization: `Bearer ${token}` };
}

const upload = (endpoint, field, filePath, body = {}) => {
  let r = request(app).post(endpoint).set(auth());
  const bodyKeys = Object.keys(body);
  if (bodyKeys.length) {
    r = r.field(bodyKeys[0], body[bodyKeys[0]]);
  }
  r = r.attach(field, filePath);
  return r;
};

async function expectStatus(res, wanted, label) {
  report(`${label}: http ${wanted}`, res.status === wanted, `got ${res.status}`);
}

// ---------------------------------------------------------------------------
// 1. AUTH GUARDS
// ---------------------------------------------------------------------------
async function testAuthGuards() {
  const noToken = await request(app).post("/user/upload-identity-document");
  report("auth: no token -> 401", noToken.status === 401, `got ${noToken.status}`);
}

// ---------------------------------------------------------------------------
// 2. CLIENT (role=client) identity verification
// ---------------------------------------------------------------------------
async function testClient() {
  setUser("client");

  const res = await upload("/user/upload-identity-document", "identityDocument", ppPath);
  await expectStatus(res, 200, "client identity");
  const data = res.body && res.body.data ? res.body.data : res.body;
  report(
    "client identity: passport verified",
    data.verificationStatus === "verified",
    `status=${data.verificationStatus} score=${data.trustScore}`
  );
  report(
    "client identity: trustScore >= 45",
    typeof data.trustScore === "number" && data.trustScore >= 45,
    `score=${data.trustScore}`
  );
  report(
    "client identity: identityVerified persisted",
    state.user.identityVerified === true,
    `identityVerified=${state.user.identityVerified}`
  );
  report(
    "client identity: account status verified",
    state.user.status === "verified" && state.user.accountVerified === true,
    `status=${state.user.status} accountVerified=${state.user.accountVerified}`
  );

  const resWeak = await upload("/user/upload-identity-document", "identityDocument", weakPath);
  const wdata = resWeak.body && resWeak.body.data ? resWeak.body.data : resWeak.body;
  report(
    "client identity: 'normal camera quality' image is never hard-rejected",
    ["pending", "verified"].includes(wdata.verificationStatus),
    `status=${wdata.verificationStatus} score=${wdata.trustScore}`
  );

  const resBlank = await upload("/user/upload-identity-document", "identityDocument", blankPath);
  const bdata = resBlank.body && resBlank.body.data ? resBlank.body.data : resBlank.body;
  report(
    "client identity: blank/no-content image -> pending or rejected",
    ["pending", "rejected"].includes(bdata.verificationStatus),
    `status=${bdata.verificationStatus} score=${bdata.trustScore}`
  );
}

// ---------------------------------------------------------------------------
// 3. SOLO PROFESSIONAL (role=solo): identity + license + business
// ---------------------------------------------------------------------------
async function testSolo() {
  setUser("solo");

  // 3a. Identity first
  const id = await upload("/user/upload-identity-document", "identityDocument", dlPath);
  const idData = id.body && id.body.data ? id.body.data : id.body;
  report(
    "solo identity: DL verified",
    idData.verificationStatus === "verified",
    `status=${idData.verificationStatus} score=${idData.trustScore}`
  );

  // 3b. Professional license
  const pro = await request(app)
    .post("/user/upload-professional-document")
    .set(auth())
    .field("licenseType", "nails")
    .attach("professionalDocument", dlPath);
  await expectStatus(pro, 200, "solo professional");
  report(
    "solo professional: verified & professionalVerified persisted",
    pro.body.data.professionalVerified === true && state.user.professionalVerified === true,
    `resp=${pro.body.data.professionalVerified} db=${state.user.professionalVerified}`
  );

  // 3c. "normal quality" license image must not be blocked by the quality gate
  const proWeak = await request(app)
    .post("/user/upload-professional-document")
    .set(auth())
    .field("licenseType", "nails")
    .attach("professionalDocument", weakPath);
  report(
    "solo professional: 250x160 image passes quality gate (not hard-rejected)",
    proWeak.status === 200 && proWeak.body.status === true,
    `http=${proWeak.status} msg="${proWeak.body.message || ""}"`
  );

  // tiny image must be rejected by the quality gate
  const proTiny = await request(app)
    .post("/user/upload-professional-document")
    .set(auth())
    .field("licenseType", "nails")
    .attach("professionalDocument", tinyPath);
  report(
    "solo professional: 200x150 image rejected (below minimum)",
    proTiny.status === 200 && proTiny.body.status === false,
    `http=${proTiny.status} msg="${proTiny.body.message || ""}"`
  );

  // 3d. Business document (image) for a solo professional
  const biz = await upload("/user/upload-business-document", "businessDocument", ppPath);
  const bzData = biz.body && biz.body.data ? biz.body.data : biz.body;
  await expectStatus(biz, 200, "solo business");
  report(
    "solo business: verified with score >= 45",
    bzData.verificationStatus === "verified" && bzData.trustScore >= 45,
    `status=${bzData.verificationStatus} score=${bzData.trustScore}`
  );
  report(
    "solo business: businessVerified persisted",
    state.user.businessVerified === true,
    `businessVerified=${state.user.businessVerified}`
  );

  // 3e. Business document too small -> quality gate rejects politely
  const bizTiny = await upload("/user/upload-business-document", "businessDocument", tinyPath);
  report(
    "solo business: tiny image rejected politely (no 500)",
    bizTiny.status === 200 && bizTiny.body.status === false,
    `http=${bizTiny.status} msg="${bizTiny.body.message || ""}"`
  );
}

// ---------------------------------------------------------------------------
// 4. SUITE OWNER (role=suite): identity + business doc + Google Business
// ---------------------------------------------------------------------------
async function testSuite() {
  setUser("suite");

  // 4a. Faint/incomplete business document -> pending (requires review), not auto-rejected
  const bizWeak = await upload("/user/upload-business-document", "businessDocument", m1Path);
  const bwData = bizWeak.body && bizWeak.body.data ? bizWeak.body.data : bizWeak.body;
  await expectStatus(bizWeak, 200, "suite business weak");
  report(
    "suite: weak business doc -> pending (businessVerified stays false)",
    bwData.verificationStatus === "pending" && state.user.businessVerified === false,
    `status=${bwData.verificationStatus} businessVerified=${state.user.businessVerified}`
  );

  // 4b. Good business document -> verified
  const bizGood = await upload("/user/upload-business-document", "businessDocument", ppPath);
  const bgData = bizGood.body && bizGood.body.data ? bizGood.body.data : bizGood.body;
  report(
    "suite: good business doc verified",
    bgData.verificationStatus === "verified" && state.user.businessVerified === true,
    `status=${bgData.verificationStatus} businessVerified=${state.user.businessVerified}`
  );

  // 4c. Google Business verification
  const gb = await request(app)
    .post("/user/verify-business-google")
    .set(auth())
    .send({ googlePlaceId: "0x80f22287cb4f6ef0:0x4b3f2d1a55f7e8c1" });
  await expectStatus(gb, 200, "suite google business");
  report(
    "suite: google business verified",
    gb.body.data.businessVerified === true && gb.body.data.verificationStatus === "verified",
    `businessVerified=${gb.body.data.businessVerified}`
  );
  report(
    "suite: googlePlaceId persisted on Social",
    state.socialUpdates.some((u) => u.googlePlaceId),
    JSON.stringify(state.socialUpdates)
  );
  report(
    "suite: user row marked verified + businessVerified",
    state.user.businessVerified === true &&
      state.user.status === "verified" &&
      state.user.accountVerified === true,
    `status=${state.user.status} businessVerified=${state.user.businessVerified}`
  );

  // 4d. Missing googlePlaceId -> 400
  const gbBad = await request(app)
    .post("/user/verify-business-google")
    .set(auth())
    .send({});
  report(
    "suite: google business missing id -> 400",
    gbBad.status === 400,
    `got ${gbBad.status}`
  );

  // 4e. Public marketplace profile carries the badge fields
  const prof = await request(app)
    .get("/marketplace/mkt-test-1")
    .set(auth());
  await expectStatus(prof, 200, "marketplace profile");
  const u = prof.body && prof.body.data ? prof.body.data.user : null;
  report(
    "marketplace profile: user verification fields exposed",
    !!u &&
      Object.keys(u).includes("status") &&
      Object.keys(u).includes("accountVerified") &&
      Object.keys(u).includes("professionalVerified") &&
      Object.keys(u).includes("businessVerified"),
    u ? JSON.stringify(u) : "no user in profile"
  );
  report(
    "marketplace profile: suite shows Verified Business flags",
    !!u && u.status === "verified" && u.businessVerified === true && u.accountVerified === true,
    u ? `status=${u.status} businessVerified=${u.businessVerified}` : "no user"
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function cleanupUploads() {
  const docsDir = path.join(process.cwd(), "uploads", "verification-docs");
  if (!fs.existsSync(docsDir)) return;
  for (const sub of ["identityCard", "licenseCard", "businessDoc"]) {
    const dir = path.join(docsDir, sub);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith("user-usr-")) {
        fs.rmSync(path.join(dir, file), { force: true });
      }
    }
  }
}

(async () => {
  try {
    await testAuthGuards();
    await testClient();
    await testSolo();
    await testSuite();

    const notifSummary = state.notifications.map((n) => n.type).join(",");
    report(
      "notifications: at least one verification notification created",
      state.notifications.length > 0,
      notifSummary || "none"
    );

    cleanupUploads();
    console.log(
      failures === 0
        ? "\nALL E2E VERIFICATION TESTS PASSED"
        : `\n${failures} TEST(S) FAILED`
    );
    process.exit(failures === 0 ? 0 : 1);
  } catch (e) {
    cleanupUploads();
    console.error("FATAL:", e);
    process.exit(1);
  }
})();
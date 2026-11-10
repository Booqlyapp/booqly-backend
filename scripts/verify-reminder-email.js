/**
 * Verifies reminder email HTML structure + action links (no SMTP send).
 * Usage: node scripts/verify-reminder-email.js
 */
const fs = require("fs");
const path = require("path");

require("ts-node/register/transpile-only");

const {
  BookingConfirmationEmailService,
} = require("../src/services/booking_confirmation_email.service");

const outDir = path.join(__dirname, "_preview");
fs.mkdirSync(outDir, { recursive: true });

const appointmentId = "11111111-2222-3333-4444-555555555555";
const customLink = "jasmine-studio";

const cases = [
  {
    name: "24h-app",
    params: {
      toEmail: "brianna@example.com",
      clientName: "Brianna T.",
      businessName: "Jasmine Studio",
      businessAddress: "123 Main St, Brooklyn, NY",
      customLink,
      dateTime: new Date("2026-11-11T14:00:00.000Z"),
      serviceNames: "Premium Service",
      providerName: "Jasmine",
      reminderKind: "24h",
      appointmentId,
      source: "app",
    },
    expectReschedule: `https://api.booqlyapp.com/appointments/${appointmentId}?action=reschedule`,
    expectCancel: `https://api.booqlyapp.com/appointments/${appointmentId}?action=cancel`,
    expectHeadline: "See you tomorrow, Brianna!",
  },
  {
    name: "1h-web",
    params: {
      toEmail: "brianna@example.com",
      clientName: "Brianna T.",
      businessName: "Jasmine Studio",
      businessAddress: "123 Main St, Brooklyn, NY",
      customLink,
      dateTime: new Date("2026-11-11T14:00:00.000Z"),
      serviceNames: "Premium Service",
      providerName: "Jasmine",
      reminderKind: "1h",
      appointmentId,
      source: "web",
    },
    expectReschedule: `https://${customLink}.booqlyapp.com/appointment/${appointmentId}?action=reschedule`,
    expectCancel: `https://${customLink}.booqlyapp.com/appointment/${appointmentId}?action=cancel`,
    expectHeadline: "See you soon, Brianna!",
  },
];

let failed = 0;

for (const c of cases) {
  const { subject, text, html } =
    BookingConfirmationEmailService.buildClientReminderEmailContent(c.params);

  const checks = [
    [
      "subject",
      subject.includes(
        `Reminder: appointment with ${c.params.businessName} in`
      ),
    ],
    ["headline", html.includes(c.expectHeadline)],
    ["subtext hours", html.includes("Your appointment is in")],
    ["calendar cta", html.includes("Add to Calendar")],
    ["calendar href", html.includes("calendar.google.com/calendar/render")],
    ["service row", html.includes("Premium Service")],
    ["provider row", html.includes(">Jasmine<") || html.includes("Jasmine")],
    ["reschedule href", html.includes(`href="${c.expectReschedule}"`)],
    ["cancel href", html.includes(`href="${c.expectCancel}"`)],
    ["powered by", html.includes("Powered by")],
    ["text reschedule", text.includes(c.expectReschedule)],
    ["text cancel", text.includes(c.expectCancel)],
  ];

  const file = path.join(outDir, `reminder-${c.name}.html`);
  fs.writeFileSync(file, html, "utf8");

  console.log(`\n[${c.name}] subject: ${subject}`);
  console.log(`[${c.name}] preview: ${file}`);
  for (const [label, ok] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

console.log("\nAll reminder email checks passed");

import { Router, Request, Response } from "express";

/**
 * Browser fallback for email "Reschedule / Cancel" links on app bookings.
 * When the Booqly app is installed, Android/iOS App Links / custom scheme
 * open the appointment in-app. Otherwise this page offers an open-app button.
 */
const router = Router();

router.get("/appointments/:appointmentId", (req: Request, res: Response) => {
  const appointmentId = String(req.params.appointmentId || "").trim();
  const action = String(req.query.action || "reschedule").trim().toLowerCase();
  const safeAction = action === "cancel" ? "cancel" : "reschedule";

  if (!appointmentId) {
    res.status(400).send("Missing appointment id");
    return;
  }

  const deepLink = `booqly://appointments/${encodeURIComponent(appointmentId)}?action=${safeAction}`;
  const httpsLink = `https://api.booqlyapp.com/appointments/${encodeURIComponent(appointmentId)}?action=${safeAction}`;
  const title =
    safeAction === "cancel" ? "Cancel your appointment" : "Reschedule your appointment";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${deepLink}" />
  <title>${title} · Booqly</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; background:#F3F4F6; color:#111827; }
    .card { max-width:420px; margin:48px auto; background:#fff; border-radius:16px; padding:28px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    h1 { font-size:22px; margin:0 0 10px; }
    p { color:#6B7280; font-size:14px; line-height:1.5; margin:0 0 20px; }
    a.btn { display:inline-block; background:#759CC9; color:#fff; text-decoration:none; font-weight:700; padding:12px 18px; border-radius:10px; }
    a.secondary { display:block; margin-top:14px; color:#3B629B; font-size:13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>Opening this booking in the Booqly app…</p>
    <a class="btn" href="${deepLink}">Open in Booqly</a>
    <a class="secondary" href="${httpsLink}">Having trouble? Tap here</a>
  </div>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`);
});

export default router;

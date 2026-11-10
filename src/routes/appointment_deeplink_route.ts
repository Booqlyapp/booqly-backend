import { Router, Request, Response } from "express";

/**
 * Browser fallback for email appointment links.
 * Prefer Android Intent URLs so Chrome handoff does not leave a black Flutter surface.
 * Custom scheme + https remain as fallbacks.
 */
const router = Router();

router.get("/appointments/:appointmentId", (req: Request, res: Response) => {
  const appointmentId = String(req.params.appointmentId || "").trim();
  const action = String(req.query.action || "reschedule").trim().toLowerCase();
  const safeAction =
    action === "cancel"
      ? "cancel"
      : action === "pay_deposit"
        ? "pay_deposit"
        : "reschedule";

  if (!appointmentId) {
    res.status(400).send("Missing appointment id");
    return;
  }

  const idEnc = encodeURIComponent(appointmentId);
  const deepLink = `booqly://appointments/${idEnc}?action=${safeAction}`;
  const httpsLink = `https://api.booqlyapp.com/appointments/${idEnc}?action=${safeAction}`;
  // Chrome/Android: open the installed app by package instead of a bare custom-scheme hop.
  const androidIntent = `intent://appointments/${idEnc}?action=${safeAction}#Intent;scheme=booqly;package=com.booqlyapp;S.browser_fallback_url=${encodeURIComponent(httpsLink)};end`;
  const title =
    safeAction === "cancel"
      ? "Cancel your appointment"
      : safeAction === "pay_deposit"
        ? "Pay your deposit"
        : "Reschedule your appointment";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    <a id="openApp" class="btn" href="${androidIntent}">Open in Booqly</a>
    <a class="secondary" href="${deepLink}">Use app link</a>
    <a class="secondary" href="${httpsLink}">Having trouble? Tap here</a>
  </div>
  <script>
    (function () {
      var ua = (navigator.userAgent || '').toLowerCase();
      var isAndroid = ua.indexOf('android') !== -1;
      var target = isAndroid
        ? ${JSON.stringify(androidIntent)}
        : ${JSON.stringify(deepLink)};
      var btn = document.getElementById('openApp');
      if (btn) btn.setAttribute('href', target);
      // Slight delay so the page paints before leaving the browser (avoids blank handoff).
      setTimeout(function () {
        window.location.href = target;
      }, 250);
    })();
  </script>
</body>
</html>`);
});

export default router;

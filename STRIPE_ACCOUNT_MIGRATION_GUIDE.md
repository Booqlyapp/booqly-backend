# Stripe Account Migration Guide

Use this when swapping Booqly over to a different Stripe account (new business, new
region, moving from a personal test account to the real one, etc.). It walks through
generating everything the app needs, in the order you need it, and exactly where each
value goes.

This does **not** change any variable names — only the values. Everything below
assumes you're keeping the same `.env` keys and just replacing what they point to.

---

## 0. Before you start

Decide up front: **test mode or live mode**, and stick to it everywhere below. Stripe
keys, prices, and webhooks are mode-specific — a `pk_test_...` will never work
against data created in live mode, and vice versa. Toggle the mode switch in the top
right of the Stripe Dashboard before doing anything else.

---

## 1. Get your API keys

1. Log into the new Stripe account → **Developers → API keys**.
2. Copy the **Publishable key** (starts `pk_test_...` or `pk_live_...`).
3. Click **Reveal live key** / copy the **Secret key** (starts `sk_test_...` or
   `sk_live_...`). Treat this like a password — never commit it, never paste it
   somewhere public.

Write these down somewhere temporary (a scratch note, not committed anywhere) — you'll
paste them into `.env` in step 4.

---

sk_test_51TwEVnF444i3qbSfLpEJmWv2t9CtezG2x8kBsmF6j6gefpd6XzXGAxabVFGpPG7cFv2XGjyVccfKcQfGJ7APyrd200kSo1UYm0

pk_test_51TwEVnF444i3qbSflPW1AmUYlihi2hLyvIZU9hCiermfEv4TnRKqWTogPzVjqKBNb8G0NSp1SwSjBDFIkBfGVH2t00fdj5s642

## 2. Create the 8 subscription prices

Booqly has 8 fixed plans. Go to **Product catalog → Add product** and create each one
below as a **recurring, monthly** price in **USD**. You can create all 8 under one
product or as 8 separate products — either works, since the app only ever stores the
resulting `price_...` ID, not the product.

| Plan name (for your reference) | Amount | Billing period | `.env` variable to fill in            |
|---------------------------------|--------|-----------------|----------------------------------------|
| Premium (client)                | $4.99  | Monthly          | `STRIPE_CLIENT_PREMIUM_PRICE_ID`       |
| Basic (solo)                    | $14.99 | Monthly          | `STRIPE_SOLO_BASIC_PRICE_ID`           |
| Pro (solo)                      | $29.99 | Monthly          | `STRIPE_SOLO_PRO_PRICE_ID`             |
| Premium (solo)                  | $49.99 | Monthly          | `STRIPE_SOLO_PREMIUM_PRICE_ID`         |
| Starter Suite                   | $49.99 | Monthly          | `STRIPE_SUITE_STARTER_PRICE_ID`        |
| Growing Suite                   | $74.99 | Monthly          | `STRIPE_SUITE_GROWING_PRICE_ID`        |
| Pro Suite                       | $99.99 | Monthly          | `STRIPE_SUITE_PRO_PRICE_ID`            |
| Elite Suite                     | $149.99| Monthly          | `STRIPE_SUITE_ELITE_PRICE_ID`          |

For each one, after you save it, open the price and copy the ID shown at the top —
it looks like `price_1AbCdEfGhIjKlMnO`. That's what goes in the matching `.env`
variable.

> **Prefer the CLI/API instead of clicking through the Dashboard 8 times?** You can
> run this with the [Stripe CLI](https://stripe.com/docs/stripe-cli) or `curl`,
> substituting your new secret key and looping the table above. Ask me and I'll hand
> you the exact commands, or give me the secret key and I'll run them for you.

---

## 3. Register the webhook endpoint

1. **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL:** `https://api.booqlyapp.com/webhook/stripe`
3. **Events to send** — select at least these five (the app ignores everything else):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Save, then open the endpoint you just created and click **Reveal** under
   **Signing secret**. Copy the value — it starts with `whsec_...`.

That's `STRIPE_WEBHOOK_SECRET`.

---

## 4. Fill in the backend `.env`

You should now have 11 values. Open `.env` (in this repo, and — separately — on the
production server, see step 6) and replace only the values, keeping the variable
names exactly as they are:

```
STRIPE_PUBLISHABLE_KEY=<pk_... from step 1>
STRIPE_SECRET_KEY=<sk_... from step 1>
STRIPE_WEBHOOK_SECRET=<whsec_... from step 3>

STRIPE_CLIENT_PREMIUM_PRICE_ID=<price_... Premium (client)>
STRIPE_SOLO_BASIC_PRICE_ID=<price_... Basic (solo)>
STRIPE_SOLO_PRO_PRICE_ID=<price_... Pro (solo)>
STRIPE_SOLO_PREMIUM_PRICE_ID=<price_... Premium (solo)>
STRIPE_SUITE_STARTER_PRICE_ID=<price_... Starter Suite>
STRIPE_SUITE_GROWING_PRICE_ID=<price_... Growing Suite>
STRIPE_SUITE_PRO_PRICE_ID=<price_... Pro Suite>
STRIPE_SUITE_ELITE_PRICE_ID=<price_... Elite Suite>
```

---

## 5. Update the Flutter app

The mobile app has its **own copy** of the publishable key — it is not read from the
backend `.env` at runtime, so this step is easy to miss.

File: `booqly-flutter/lib/services/stripe_payment_service.dart`, line 9:

```dart
static const String _publishableKey = 'pk_test_...'; // <- replace with the new pk_ from step 1
```

This is compiled into the app, so it only takes effect after you rebuild and release
a new version of the app — a hot reload/restart of a dev build is enough to test
locally, but real users need a new release build.

---

## 6. Deploy

The production `.env` lives only on the VPS — it is **not** part of the git repo and
is deliberately preserved across deploys (the deploy workflow backs it up before
`git reset --hard` and restores it after). Pushing your local `.env` change to GitHub
will **not** update production.

1. SSH into the VPS.
2. Edit `/var/www/booqly-server/.env` with the same 11 values from step 4.
3. Restart the app so Node picks up the new environment: `pm2 restart booqly-server`.

---

## 7. (Optional) Sync the database

One migration (`20251203000001-seed-subscription-plans.js`) already ran in production
and wrote the *old* price IDs into the `SubscriptionPlans` table. Nothing in the app
actually reads that column to process payments (confirmed — both subscription
creation and webhook handling resolve prices from `.env`, not the database), so this
step is cosmetic only. If you want the DB to stay accurate for anyone inspecting it
directly, give me the 8 new price IDs and I'll run the `UPDATE` directly (I already
have working DB access from the earlier OTP migration work).

---

## 8. Test before calling it done

1. In the new Stripe Dashboard, open your webhook endpoint and click **Send test
   webhook** for `invoice.payment_succeeded`. Watch `pm2 logs booqly-server` on the
   VPS for a `200` response — confirms the signing secret and endpoint are wired up
   correctly.
2. Run one real subscription end-to-end from the app (test mode, using a
   [Stripe test card](https://stripe.com/docs/testing) like `4242 4242 4242 4242` if
   you're in test mode) and confirm a `Subscription` row is created with the right
   `planType`.
3. Only then repeat for live mode if this was a test → live cutover, and only then
   release the app update from step 5.

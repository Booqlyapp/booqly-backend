/**
 * Maps App Store / Play Store product IDs to internal planType + billing interval.
 */
export const IAP_PRODUCT_MAP: Record<
  string,
  { planType: string; billingInterval: 'month' | 'year' }
> = {
  'booqly.client.premium.monthly': { planType: 'client_premium', billingInterval: 'month' },
  'booqly.client.premium.yearly': { planType: 'client_premium', billingInterval: 'year' },
  'booqly.solo.basic.monthly': { planType: 'solo_basic', billingInterval: 'month' },
  'booqly.solo.basic.yearly': { planType: 'solo_basic', billingInterval: 'year' },
  'booqly.solo.pro.monthly': { planType: 'solo_pro', billingInterval: 'month' },
  'booqly.solo.pro.yearly': { planType: 'solo_pro', billingInterval: 'year' },
  'booqly.solo.premium.monthly': { planType: 'solo_premium', billingInterval: 'month' },
  'booqly.solo.premium.yearly': { planType: 'solo_premium', billingInterval: 'year' },
  'booqly.suite.starter.monthly': { planType: 'suite_starter', billingInterval: 'month' },
  'booqly.suite.starter.yearly': { planType: 'suite_starter', billingInterval: 'year' },
  'booqly.suite.growing.monthly': { planType: 'suite_growing', billingInterval: 'month' },
  'booqly.suite.growing.yearly': { planType: 'suite_growing', billingInterval: 'year' },
  'booqly.suite.pro.monthly': { planType: 'suite_pro', billingInterval: 'month' },
  'booqly.suite.pro.yearly': { planType: 'suite_pro', billingInterval: 'year' },
  'booqly.suite.elite.monthly': { planType: 'suite_elite', billingInterval: 'month' },
  'booqly.suite.elite.yearly': { planType: 'suite_elite', billingInterval: 'year' },
};

export function resolveIapProduct(productId: string) {
  return IAP_PRODUCT_MAP[productId] ?? null;
}

/** Catalog prices used for admin MRR after Stripe subscription billing was removed. */
export const IAP_PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  client_premium: { monthly: 4.99, yearly: 59.88 },
  solo_basic: { monthly: 14.99, yearly: 143.90 },
  solo_pro: { monthly: 29.99, yearly: 287.90 },
  solo_premium: { monthly: 49.99, yearly: 479.90 },
  suite_starter: { monthly: 49.99, yearly: 479.90 },
  suite_growing: { monthly: 74.99, yearly: 719.90 },
  suite_pro: { monthly: 99.99, yearly: 959.90 },
  suite_elite: { monthly: 149.99, yearly: 1439.90 },
};

export function resolveBillingInterval(metadata: unknown): 'month' | 'year' {
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  if (meta.billingInterval === 'year' || meta.billingInterval === 'yearly') {
    return 'year';
  }
  if (typeof meta.storeProductId === 'string') {
    const mapped = resolveIapProduct(meta.storeProductId);
    if (mapped) return mapped.billingInterval;
  }
  return 'month';
}

/** Monthly recurring amount for a paid plan (yearly plans are divided by 12). */
export function monthlyRecurringAmount(
  planType: string,
  billingInterval: 'month' | 'year' = 'month'
): number {
  const prices = IAP_PLAN_PRICES[planType];
  if (!prices) return 0;
  if (billingInterval === 'year') {
    return Math.round((prices.yearly / 12) * 100) / 100;
  }
  return prices.monthly;
}

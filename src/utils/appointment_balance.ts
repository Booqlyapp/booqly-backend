/**
 * When a provider/owner edits an appointment and the total changes,
 * keep any amount already paid (deposit / prior payments) and roll the
 * difference into remainingBalance — never require a second deposit charge.
 *
 * Example: $100 total, $25 deposit paid → edit to $200
 *   amountPaid = 25, remainingBalance = 175
 */
export function remainingBalanceAfterPriceEdit(params: {
  oldPrice: number;
  oldRemainingBalance?: number | null;
  oldDepositAmount?: number | null;
  newPrice: number;
}): { remainingBalance: number; amountPaid: number } {
  const oldPrice = Number(params.oldPrice) || 0;
  const newPrice = Math.max(0, Number(params.newPrice) || 0);

  let oldRemaining: number;
  if (
    params.oldRemainingBalance != null &&
    Number.isFinite(Number(params.oldRemainingBalance))
  ) {
    oldRemaining = Number(params.oldRemainingBalance);
  } else if (
    params.oldDepositAmount != null &&
    Number.isFinite(Number(params.oldDepositAmount))
  ) {
    oldRemaining = Math.max(0, oldPrice - Number(params.oldDepositAmount));
  } else {
    // Nothing recorded as paid yet — full old total was still due.
    oldRemaining = oldPrice;
  }

  const amountPaid = Math.max(0, oldPrice - oldRemaining);
  const remainingBalance = Math.max(0, newPrice - amountPaid);
  return { remainingBalance, amountPaid };
}

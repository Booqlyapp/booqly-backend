import { Marketplace } from "../models/marketplace_model";

export type BookingWindowSettings = {
  bookingWindowLimited: boolean;
  bookingWindowFrom: string | Date | null;
  bookingWindowUntil: string | Date | null;
};

function toDateOnlyString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, 10);
  }
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function appointmentDateOnly(appointmentDate: Date): string {
  const y = appointmentDate.getFullYear();
  const m = String(appointmentDate.getMonth() + 1).padStart(2, "0");
  const d = String(appointmentDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * When limited, clients may only book on calendar dates within [from, until] inclusive.
 * Unlimited (default) allows any future date per existing booking rules.
 */
export class BookingWindowService {
  static async getMarketplaceSettings(
    marketplaceId: string
  ): Promise<BookingWindowSettings> {
    const marketplace = await Marketplace.findByPk(marketplaceId, {
      attributes: [
        "bookingWindowLimited",
        "bookingWindowFrom",
        "bookingWindowUntil",
      ],
    });

    return {
      bookingWindowLimited: Boolean(marketplace?.bookingWindowLimited),
      bookingWindowFrom: marketplace?.bookingWindowFrom ?? null,
      bookingWindowUntil: marketplace?.bookingWindowUntil ?? null,
    };
  }

  static assertWithinWindow(
    settings: BookingWindowSettings,
    appointmentDate: Date
  ): { allowed: boolean; message?: string } {
    if (!settings.bookingWindowLimited) {
      return { allowed: true };
    }

    const from = toDateOnlyString(settings.bookingWindowFrom);
    const until = toDateOnlyString(settings.bookingWindowUntil);

    if (!from || !until) {
      return {
        allowed: false,
        message:
          "This provider has a limited booking window that is not fully configured. Please choose another date or contact the provider.",
      };
    }

    const day = appointmentDateOnly(appointmentDate);
    if (day < from || day > until) {
      return {
        allowed: false,
        message: `Bookings are only available from ${from} until ${until}.`,
      };
    }

    return { allowed: true };
  }

  static async assertMarketplaceAllowsDate(
    marketplaceId: string,
    appointmentDate: Date
  ): Promise<{ allowed: boolean; message?: string }> {
    const settings = await this.getMarketplaceSettings(marketplaceId);
    return this.assertWithinWindow(settings, appointmentDate);
  }
}

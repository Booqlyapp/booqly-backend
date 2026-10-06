import { Router } from "express";
import AuthRoute from "./auth_route";
import SignedRoute from "./signed_route";
import UserRoute from "./user_route";
import MarketplaceRoute from "./marketplace_route";
import SocialRoute from "./social_route";
import ServiceRoute from "./service_route";
import ScheduleRoute from "./schedule_route";
import AppointmentRoute from "./appointment_route";
import SubscriptionRoute from "./subscription_route";
import ChatRoute from "./chat_route";
import ReviewRoute from "./review_route";
import ReferralRoute from "./referral_route";
import NotificationRoute from "./notification_route";
import AnalyticsRoute from "./analytics_route";
import ProviderAnalyticsRoute from "./provider_analytics_route";
import SearchRoute from "./search_route";
import DebugRoute from "./debug_route";
import LogRoute from "./log_route";
import CategoryRoute from "./category_route";
import PromotionRoute from "./promotion_route";
import PromoUrlRoute from "./promo_url_route";
import PublicPromoRoute from "./public_promo_route";
import PublicReelRoute from "./public_reel_route";
import PromoBookingRoute from "./promo_booking_route";
import AssetlinksRoute from "./assetlinks_route";
import FriendRoute from "./friend_route";
import FavoriteRoute from "./favorite_route";
import VideoRoute from "./video_route";
import ExternalAppointmentRoute from "./external_appointment_route";
import BlockedTimeRoute from "./blocked_time_route";
import WebhookRoute from "./webhook_route";
import WaitlistRoute from "./waitlist_route";
import TeamMemberRoute from "./team_member_route";
import ContactRoute from "./contact_route";
import AdminUserRoute from "./admin_user_route";
import AdminPaymentRoute from "./admin_payment_route";
import AdminReviewRoute from "./admin_review_route";
import AdminContentReportRoute from "./admin_content_report_route";
import AdminDashboardRoute from "./admin_dashboard_route";
import AdminAnnouncementRoute from "./admin_announcement_route";
import AdminSupportRoute from "./admin_support_route";
import SupportRoute from "./support_route";
import ContentReportRoute from "./content_report_route";
import StripeConnectRoute from "./stripe_connect_route";

const router = Router();

// Webhook route (must be before other routes for raw body parsing)
router.use("/webhook", WebhookRoute);

// Core  routes
router.use("/auth", AuthRoute);
router.use("/signature", SignedRoute);
router.use("/user", UserRoute);
router.use("/marketplace", MarketplaceRoute);
router.use("/social", SocialRoute);
router.use("/service", ServiceRoute);
router.use("/schedule", ScheduleRoute);
router.use("/appointment", AppointmentRoute);
router.use("/stripe-connect", StripeConnectRoute);

// New feature routes
router.use("/subscriptions", SubscriptionRoute);
router.use("/chat", ChatRoute);
router.use("/reviews", ReviewRoute);
router.use("/referrals", ReferralRoute);
router.use("/notifications", NotificationRoute);
router.use("/analytics", AnalyticsRoute);
router.use("/provider-analytics", ProviderAnalyticsRoute);
router.use("/search", SearchRoute);
router.use("/promotions", PromotionRoute);
router.use("/promo-url", PromoUrlRoute);
router.use("/", PublicPromoRoute); // For public /promo endpoint
router.use("/", PublicReelRoute); // For public /r/:code reel short links
router.use("/", PromoBookingRoute); // For promo booking data endpoint
router.use("/", AssetlinksRoute); // For Android App Links verification
router.use("/friends", FriendRoute);
router.use("/favorites", FavoriteRoute);
router.use("/videos", VideoRoute);
router.use("/public", ExternalAppointmentRoute); // Public booking endpoints
router.use("/blocked-times", BlockedTimeRoute);
router.use("/waitlist", WaitlistRoute);
router.use("/team-members", TeamMemberRoute);

// Website contact form
router.use("/contact", ContactRoute);

// Debug routes - dev/staging only. Never mounted in production, and the
// route file itself also requires an authenticated admin as a second layer
// of protection in case NODE_ENV is ever misconfigured.
if (process.env.NODE_ENV !== "production") {
  router.use("/debug", DebugRoute);
}

// Logging routes
router.use("/admin", LogRoute);
router.use("/admin/users", AdminUserRoute);
router.use("/admin/payments", AdminPaymentRoute);
router.use("/admin/reviews", AdminReviewRoute);
router.use("/admin/content-reports", AdminContentReportRoute);
router.use("/admin/dashboard", AdminDashboardRoute);
router.use("/admin/announcements", AdminAnnouncementRoute);
router.use("/admin/support", AdminSupportRoute);
router.use("/support", SupportRoute);
router.use("/content-reports", ContentReportRoute);
router.use("/categories", CategoryRoute);

export default router;

import { Sequelize } from "sequelize";
import initUser, { User } from "./user_model";
import initMarketplace, { Marketplace } from "./marketplace_model";
import initSchedule, { Schedule } from "./schedule_model";
import initService, { Service } from "./service_model";
import initSocial, { Social } from "./social_model";
import initAppointment, { Appointment } from "./appointment_model";
import initAppointmentServiceStatus, {
  AppointmentServiceStatus,
} from "./appointment_service_status_model";
import initSubscription, { Subscription } from "./subscription_model";
import initSubscriptionPlan, { SubscriptionPlan } from "./subscription_plan_model";
import initReview, { Review } from "./review_model";
import initReviewFlag, { ReviewFlag } from "./review_flag_model";
import initConversation, { Conversation } from "./conversation_model";
import initMessage, { Message } from "./message_model";
import initNotification, { Notification } from "./notification_model";
import initReferral, { Referral } from "./referral_model";
import initReferralInvite, { ReferralInvite } from "./referral_invite_model";
import initLog, { Log } from "./log_model";
import initCategory, { Category } from "./category_model";
import initSubcategory, { Subcategory } from "./subcategory_model";
import initPromotion, { Promotion } from "./promotion_model";
import initServiceAddOn, { ServiceAddOn } from "./service_addon_model";
import initFriend, { Friend } from "./friend_model";
import initExternalAppointment, { ExternalAppointment } from "./external_appointment_model";
import initBlockedTime, { BlockedTime } from "./blocked_time_model";
import initWaitlist, { Waitlist } from "./waitlist_model";
import initVideo, { Video } from "./video_model";
import initVideoLike, { VideoLike } from "./video_like_model";
import initVideoComment, { VideoComment } from "./video_comment_model";
import initVideoCommentReaction, { VideoCommentReaction } from "./video_comment_reaction_model";
import initVideoFollow, { VideoFollow } from "./video_follow_model";
import initTeamMemberPermission, { TeamMemberPermission } from "./team_member_permission_model";
import initContentReport, { ContentReport } from "./content_report_model";
import initAnnouncement, { Announcement } from "./announcement_model";
import initSupportTicket, { SupportTicket } from "./support_ticket_model";
import initSupportTicketMessage, {
  SupportTicketMessage,
} from "./support_ticket_message_model";

export { Category, Subcategory, Promotion, ServiceAddOn, Friend, ExternalAppointment, BlockedTime, Waitlist, Video, VideoLike, VideoComment, VideoCommentReaction, VideoFollow, TeamMemberPermission, ContentReport, Announcement, SupportTicket, SupportTicketMessage };

export function initModels(sequelize: Sequelize) {
  initUser(sequelize);
  initMarketplace(sequelize);
  initSchedule(sequelize);
  initService(sequelize);
  initSocial(sequelize);
  initAppointment(sequelize);
  initAppointmentServiceStatus(sequelize);
  initSubscription(sequelize);
  initSubscriptionPlan(sequelize);
  initReview(sequelize);
  initReviewFlag(sequelize);
  initConversation(sequelize);
  initMessage(sequelize);
  initNotification(sequelize);
  initReferral(sequelize);
  initReferralInvite(sequelize);
  initLog(sequelize);
  initCategory(sequelize);
  initSubcategory(sequelize);
  initPromotion(sequelize);
  initServiceAddOn(sequelize);
  initFriend(sequelize);
  initExternalAppointment(sequelize);
  initBlockedTime(sequelize);
  initWaitlist(sequelize);
  initVideo(sequelize);
  initVideoLike(sequelize);
  initVideoComment(sequelize);
  initVideoCommentReaction(sequelize);
  initVideoFollow(sequelize);
  initTeamMemberPermission(sequelize);
  initContentReport(sequelize);
  initAnnouncement(sequelize);
  initSupportTicket(sequelize);
  initSupportTicketMessage(sequelize);

  // User self-referencing relationship for referrals
  User.belongsTo(User, {
    foreignKey: "referredBy",
    as: "referrer",
  });

  User.hasMany(User, {
    foreignKey: "referredBy",
    as: "referredUsers",
  });

  User.hasMany(User, {
    foreignKey: "teamOwnerId",
    as: "teamMembers",
  });

  User.belongsTo(User, {
    foreignKey: "teamOwnerId",
    as: "teamOwner",
  });

  // Define the relationship between User and Marketplace
  User.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  Marketplace.hasOne(User, {
    foreignKey: "marketplaceId",
    as: "user",
  });

  // Marketplace can access reviews through userId
  Marketplace.belongsTo(User, {
    foreignKey: "userId",
    as: "provider",
  });

  // User (provider) has many reviews
  User.hasMany(Review, {
    foreignKey: "providerId",
    as: "reviews",
  });

  // Marketplace has many reviews through provider
  Marketplace.hasMany(Review, {
    foreignKey: "providerId",
    sourceKey: "userId",
    as: "reviews",
  });

  // Define the relationship between Marketplace and Schedule
  Marketplace.belongsTo(Schedule, {
    foreignKey: "scheduleId",
    as: "schedule",
  });

  Schedule.hasOne(Marketplace, {
    foreignKey: "scheduleId",
    as: "marketplace",
  });

  // UPDATED: Define the one-to-many relationship between Marketplace and Service
  // Foreign key 'marketplaceId' is in Services, so Marketplace hasMany Services
  Marketplace.hasMany(Service, {
    foreignKey: "marketplaceId",
    as: "services",
  });

  // Service belongsTo Marketplace
  Service.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  // Category and Subcategory relationships
  Category.hasMany(Subcategory, {
    foreignKey: "categoryId",
    as: "subcategories",
  });

  Subcategory.belongsTo(Category, {
    foreignKey: "categoryId",
    as: "category",
  });

  // Service relationships with Category and Subcategory
  Service.belongsTo(Category, {
    foreignKey: "categoryId",
    as: "categoryModel",
  });

  Service.belongsTo(Subcategory, {
    foreignKey: "subcategoryId",
    as: "subcategoryModel",
  });

  Category.hasMany(Service, {
    foreignKey: "categoryId",
    as: "services",
  });

  Subcategory.hasMany(Service, {
    foreignKey: "subcategoryId",
    as: "services",
  });

  // ADDED: Define the one-to-many relationship between Marketplace and Social
  Marketplace.hasOne(Social, {
    foreignKey: "marketplaceId",
    as: "socials",
  });

  Social.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  // Appointment belongsTo User
  Appointment.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // User hasMany Appointments
  User.hasMany(Appointment, {
    foreignKey: "userId",
    as: "appointments",
  });

  // Appointment belongsTo Marketplace
  Appointment.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  // Marketplace hasMany Appointments
  Marketplace.hasMany(Appointment, {
    foreignKey: "marketplaceId",
    as: "appointments",
  });

  // Waitlist relationships
  Marketplace.hasMany(Waitlist, {
    foreignKey: "marketplaceId",
    as: "waitlistEntries",
  });

  Waitlist.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  User.hasMany(Waitlist, {
    foreignKey: "clientUserId",
    as: "waitlistEntries",
  });

  Waitlist.belongsTo(User, {
    foreignKey: "clientUserId",
    as: "client",
  });

  // ADDED: Many-to-many between Appointment and Service via AppointmentServiceStatus junction
  Appointment.belongsToMany(Service, {
    through: "AppointmentServiceStatuses", // Junction table name
    foreignKey: "appointmentId",
    otherKey: "serviceId",
    as: "services",
  });

  Service.belongsToMany(Appointment, {
    through: "AppointmentServiceStatuses", // Junction table name
    foreignKey: "serviceId",
    otherKey: "appointmentId",
    as: "appointments",
  });

  // Note: No direct associations for AppointmentServiceStatus (handled via belongsToMany)

  // Subscription relationships
  User.hasMany(Subscription, {
    foreignKey: "userId",
    as: "subscriptions",
  });

  Subscription.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Review relationships
  User.hasMany(Review, {
    foreignKey: "clientId",
    as: "clientReviews",
  });

  User.hasMany(Review, {
    foreignKey: "providerId",
    as: "providerReviews",
  });

  User.hasMany(Review, {
    foreignKey: "providerId",
    as: "receivedReviews",
  });

  Review.belongsTo(User, {
    foreignKey: "clientId",
    as: "client",
  });

  Review.belongsTo(User, {
    foreignKey: "providerId",
    as: "provider",
  });

  Appointment.hasOne(Review, {
    foreignKey: "appointmentId",
    as: "review",
  });

  Review.belongsTo(Appointment, {
    foreignKey: "appointmentId",
    as: "appointment",
  });

  Review.hasMany(ReviewFlag, {
    foreignKey: "reviewId",
    as: "flags",
  });

  ReviewFlag.belongsTo(Review, {
    foreignKey: "reviewId",
    as: "review",
  });

  ReviewFlag.belongsTo(User, {
    foreignKey: "flaggedById",
    as: "flaggedBy",
  });

  ReviewFlag.belongsTo(User, {
    foreignKey: "resolvedById",
    as: "resolvedBy",
  });

  // Conversation and Message relationships
  User.hasMany(Conversation, {
    foreignKey: "clientId",
    as: "clientConversations",
  });

  User.hasMany(Conversation, {
    foreignKey: "providerId",
    as: "providerConversations",
  });

  Conversation.belongsTo(User, {
    foreignKey: "clientId",
    as: "client",
  });

  Conversation.belongsTo(User, {
    foreignKey: "providerId",
    as: "provider",
  });

  Conversation.hasMany(Message, {
    foreignKey: "conversationId",
    as: "messages",
  });

  Message.belongsTo(Conversation, {
    foreignKey: "conversationId",
    as: "conversation",
  });

  Message.belongsTo(User, {
    foreignKey: "senderId",
    as: "sender",
  });

  // Notification relationships
  User.hasMany(Notification, {
    foreignKey: "userId",
    as: "notifications",
  });

  Notification.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // Referral relationships
  User.hasMany(Referral, {
    foreignKey: "referrerId",
    as: "referrals",
  });

  User.hasMany(Referral, {
    foreignKey: "referredUserId",
    as: "referralsReceived",
  });

  Referral.belongsTo(User, {
    foreignKey: "referrerId",
    as: "referrer",
  });

  Referral.belongsTo(User, {
    foreignKey: "referredUserId",
    as: "referredUser",
  });

  // ReferralInvite relationships
  User.hasMany(ReferralInvite, {
    foreignKey: "providerId",
    as: "sentReferralInvites",
  });

  User.hasMany(ReferralInvite, {
    foreignKey: "clientId",
    as: "receivedReferralInvites",
  });

  ReferralInvite.belongsTo(User, {
    foreignKey: "providerId",
    as: "provider",
  });

  ReferralInvite.belongsTo(User, {
    foreignKey: "clientId",
    as: "client",
  });

  // Promotion relationships
  User.hasMany(Promotion, {
    foreignKey: "providerId",
    as: "promotions",
  });

  Promotion.belongsTo(User, {
    foreignKey: "providerId",
    as: "provider",
  });

  Category.hasMany(Promotion, {
    foreignKey: "categoryId",
    as: "promotions",
  });

  Promotion.belongsTo(Category, {
    foreignKey: "categoryId",
    as: "category",
  });

  Subcategory.hasMany(Promotion, {
    foreignKey: "subcategoryId",
    as: "promotions",
  });

  Promotion.belongsTo(Subcategory, {
    foreignKey: "subcategoryId",
    as: "subcategory",
  });

  // Service and ServiceAddOn relationships
  Service.hasMany(ServiceAddOn, {
    foreignKey: "serviceId",
    as: "addOns",
  });

  ServiceAddOn.belongsTo(Service, {
    foreignKey: "serviceId",
    as: "service",
  });

  // Friend relationships
  User.hasMany(Friend, {
    foreignKey: "userId",
    as: "friendships",
  });

  User.hasMany(Friend, {
    foreignKey: "friendId",
    as: "friendOf",
  });

  Friend.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Friend.belongsTo(User, {
    foreignKey: "friendId",
    as: "friend",
  });

  Friend.belongsTo(User, {
    foreignKey: "requestedBy",
    as: "requester",
  });

  // ExternalAppointment associations
  ExternalAppointment.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });

  Marketplace.hasMany(ExternalAppointment, {
    foreignKey: "marketplaceId",
    as: "externalAppointments",
  });

  // Video relationships
  User.hasMany(Video, {
    foreignKey: "userId",
    as: "videos",
  });

  Video.belongsTo(User, {
    foreignKey: "userId",
    as: "owner",
  });

  User.hasMany(VideoLike, {
    foreignKey: "userId",
    as: "videoLikes",
  });

  VideoLike.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Video.hasMany(VideoLike, {
    foreignKey: "videoId",
    as: "likes",
  });

  VideoLike.belongsTo(Video, {
    foreignKey: "videoId",
    as: "video",
  });

  User.hasMany(VideoComment, {
    foreignKey: "userId",
    as: "videoComments",
  });

  VideoComment.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  Video.hasMany(VideoComment, {
    foreignKey: "videoId",
    as: "comments",
  });

  VideoComment.belongsTo(Video, {
    foreignKey: "videoId",
    as: "video",
  });

  VideoComment.hasMany(VideoComment, {
    foreignKey: "parentCommentId",
    as: "replies",
  });

  VideoComment.belongsTo(VideoComment, {
    foreignKey: "parentCommentId",
    as: "parentComment",
  });

  User.hasMany(VideoCommentReaction, {
    foreignKey: "userId",
    as: "videoCommentReactions",
  });

  VideoCommentReaction.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  VideoComment.hasMany(VideoCommentReaction, {
    foreignKey: "commentId",
    as: "reactions",
  });

  VideoCommentReaction.belongsTo(VideoComment, {
    foreignKey: "commentId",
    as: "comment",
  });

  User.hasMany(VideoFollow, {
    foreignKey: "followerId",
    as: "followingUsers",
  });

  User.hasMany(VideoFollow, {
    foreignKey: "followingId",
    as: "followers",
  });

  VideoFollow.belongsTo(User, {
    foreignKey: "followerId",
    as: "follower",
  });

  VideoFollow.belongsTo(User, {
    foreignKey: "followingId",
    as: "following",
  });

  // TeamMemberPermission relationships
  User.hasOne(TeamMemberPermission, {
    foreignKey: "teamMemberId",
    as: "permissions",
  });

  TeamMemberPermission.belongsTo(User, {
    foreignKey: "teamMemberId",
    as: "teamMember",
  });

  TeamMemberPermission.belongsTo(User, {
    foreignKey: "ownerId",
    as: "owner",
  });

  ContentReport.belongsTo(User, {
    foreignKey: "reporterId",
    as: "reporter",
  });
  ContentReport.belongsTo(User, {
    foreignKey: "reportedUserId",
    as: "reportedUser",
  });
  ContentReport.belongsTo(User, {
    foreignKey: "originalUserId",
    as: "originalUser",
  });
  ContentReport.belongsTo(User, {
    foreignKey: "resolvedById",
    as: "resolvedBy",
  });
  User.hasMany(ContentReport, {
    foreignKey: "reporterId",
    as: "submittedContentReports",
  });
  User.hasMany(ContentReport, {
    foreignKey: "reportedUserId",
    as: "receivedContentReports",
  });

  Announcement.belongsTo(User, {
    foreignKey: "createdById",
    as: "createdBy",
  });
  User.hasMany(Announcement, {
    foreignKey: "createdById",
    as: "announcements",
  });

  SupportTicket.belongsTo(User, { foreignKey: "userId", as: "user" });
  SupportTicket.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });
  SupportTicket.belongsTo(User, { foreignKey: "assignedToId", as: "assignedTo" });
  User.hasMany(SupportTicket, { foreignKey: "userId", as: "supportTickets" });
  User.hasMany(SupportTicket, {
    foreignKey: "assignedToId",
    as: "assignedSupportTickets",
  });

  SupportTicket.hasMany(SupportTicketMessage, {
    foreignKey: "ticketId",
    as: "messages",
  });
  SupportTicketMessage.belongsTo(SupportTicket, {
    foreignKey: "ticketId",
    as: "ticket",
  });
  SupportTicketMessage.belongsTo(User, { foreignKey: "senderId", as: "sender" });
  User.hasMany(SupportTicketMessage, {
    foreignKey: "senderId",
    as: "supportTicketMessages",
  });

  Marketplace.hasMany(BlockedTime, {
    foreignKey: "marketplaceId",
    as: "blockedTimes",
  });
  BlockedTime.belongsTo(Marketplace, {
    foreignKey: "marketplaceId",
    as: "marketplace",
  });
  User.hasMany(BlockedTime, {
    foreignKey: "createdByUserId",
    as: "createdBlockedTimes",
  });
  BlockedTime.belongsTo(User, {
    foreignKey: "createdByUserId",
    as: "createdBy",
  });

  return {
    User,
    Marketplace,
    Schedule,
    Service,
    Social,
    Appointment,
    AppointmentServiceStatus,
    Subscription,
    SubscriptionPlan,
    Review,
    ReviewFlag,
    Conversation,
    Message,
    Notification,
    Referral,
    ReferralInvite,
    Log,
    Category,
    Subcategory,
    Promotion,
    ServiceAddOn,
    Friend,
    ExternalAppointment,
    BlockedTime,
    Video,
    VideoLike,
    VideoComment,
    VideoCommentReaction,
    VideoFollow,
    TeamMemberPermission,
    ContentReport,
    Announcement,
    SupportTicket,
    SupportTicketMessage,
  };
}

-- Drop all tables in the correct order (respecting foreign key constraints)

-- Drop junction tables first
DROP TABLE IF EXISTS "AppointmentServiceStatuses" CASCADE;

-- Drop dependent tables (in correct dependency order)
DROP TABLE IF EXISTS "Messages" CASCADE;
DROP TABLE IF EXISTS "Conversations" CASCADE;
DROP TABLE IF EXISTS "Reviews" CASCADE;
DROP TABLE IF EXISTS "Referrals" CASCADE;
DROP TABLE IF EXISTS "Notifications" CASCADE;
DROP TABLE IF EXISTS "Subscriptions" CASCADE;
DROP TABLE IF EXISTS "Appointments" CASCADE;
DROP TABLE IF EXISTS "Services" CASCADE;
DROP TABLE IF EXISTS "Socials" CASCADE;
DROP TABLE IF EXISTS "Schedules" CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS "Users" CASCADE;
DROP TABLE IF EXISTS "Marketplaces" CASCADE;
DROP TABLE IF EXISTS "SubscriptionPlans" CASCADE;

-- Drop the migration tracking table
DROP TABLE IF EXISTS "SequelizeMeta" CASCADE;

-- Drop any remaining enums (based on actual database enums)
DROP TYPE IF EXISTS "enum_Appointments_paymentStatus" CASCADE;
DROP TYPE IF EXISTS "enum_Appointments_status" CASCADE;
DROP TYPE IF EXISTS "enum_Conversations_status" CASCADE;
DROP TYPE IF EXISTS "enum_Messages_messageType" CASCADE;
DROP TYPE IF EXISTS "enum_Notifications_type" CASCADE;
DROP TYPE IF EXISTS "enum_Referrals_status" CASCADE;
DROP TYPE IF EXISTS "enum_Reviews_status" CASCADE;
DROP TYPE IF EXISTS "enum_Reviews_type" CASCADE;
DROP TYPE IF EXISTS "enum_SubscriptionPlans_interval" CASCADE;
DROP TYPE IF EXISTS "enum_SubscriptionPlans_userRole" CASCADE;
DROP TYPE IF EXISTS "enum_Subscriptions_planType" CASCADE;
DROP TYPE IF EXISTS "enum_Subscriptions_status" CASCADE;

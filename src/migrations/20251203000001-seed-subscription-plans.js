"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Insert subscription plans
      await queryInterface.bulkInsert(
        "SubscriptionPlans",
        [
          // Client Subscription Plans
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Premium",
            stripePriceId: process.env.STRIPE_CLIENT_PREMIUM_PRICE_ID || "price_client_premium_test",
            userRole: "client",
            price: 4.99,
            interval: "month",
            features: JSON.stringify({
              unlimited_bookings: true,
              unlimited_chat: true,
              favorite_providers: true,
              personalized_portfolio: true,
              full_booking_history: true,
              discover_any_provider: true,
              verified_reviews: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },

          // Solo Professional Plans
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Basic",
            stripePriceId: process.env.STRIPE_SOLO_BASIC_PRICE_ID || "price_solo_basic_test",
            userRole: "solo",
            price: 14.99,
            interval: "month",
            features: JSON.stringify({
              verified_business_profile: true,
              booking_calendar: true,
              internal_client_chat: true,
              limited_promotions_deals: true,
              save_up_to_20_percent_yearly: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Pro",
            stripePriceId: process.env.STRIPE_SOLO_PRO_PRICE_ID || "price_solo_pro_test",
            userRole: "solo",
            price: 29.99,
            interval: "month",
            features: JSON.stringify({
              everything_in_basic: true,
              reply_to_client_reviews: true,
              promotions_deals: true,
              limited_google_review_boost: true,
              basic_booking_analytics: true,
              custom_referral_codes: true,
              enhanced_branding: true,
              save_up_to_20_percent_yearly: true,
              most_popular: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Premium",
            stripePriceId: process.env.STRIPE_SOLO_PREMIUM_PRICE_ID || "price_solo_premium_test",
            userRole: "solo",
            price: 49.99,
            interval: "month",
            features: JSON.stringify({
              everything_in_pro: true,
              unlimited_promotions_deals: true,
              unlimited_google_review_boost: true,
              advance_booking_analytics: true,
              priority_search_ranking: true,
              beta_tool_access: true,
              save_up_to_20_percent_yearly: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },

          // Suite Owner Plans
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Starter Suite",
            stripePriceId: process.env.STRIPE_SUITE_STARTER_PRICE_ID || "price_suite_starter_test",
            userRole: "suite",
            price: 49.99,
            interval: "month",
            features: JSON.stringify({
              team_members: 3,
              all_premium_features: true,
              team_management: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Growing Suite",
            stripePriceId: process.env.STRIPE_SUITE_GROWING_PRICE_ID || "price_suite_growing_test",
            userRole: "suite",
            price: 74.99,
            interval: "month",
            features: JSON.stringify({
              team_members: 7,
              all_premium_features: true,
              team_management: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Pro Suite",
            stripePriceId: process.env.STRIPE_SUITE_PRO_PRICE_ID || "price_suite_pro_test",
            userRole: "suite",
            price: 99.99,
            interval: "month",
            features: JSON.stringify({
              team_members: 12,
              all_premium_features: true,
              team_management: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: Sequelize.literal('gen_random_uuid()'),
            name: "Elite Suite",
            stripePriceId: process.env.STRIPE_SUITE_ELITE_PRICE_ID || "price_suite_elite_test",
            userRole: "suite",
            price: 149.99,
            interval: "month",
            features: JSON.stringify({
              team_members: 20,
              all_premium_features: true,
              team_management: true,
            }),
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        { transaction }
      );

      await transaction.commit();
      console.log("✅ Subscription plans seeded successfully");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Error seeding subscription plans:", error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.bulkDelete("SubscriptionPlans", null, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

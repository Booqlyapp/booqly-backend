const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DEV_DB_NAME,
  process.env.DEV_DB_USERNAME,
  process.env.DEV_DB_PASSWORD,
  {
    host: process.env.DEV_DB_HOST,
    port: process.env.DEV_DB_PORT,
    dialect: 'postgres',
    logging: console.log,
  }
);

async function dropAllTables() {
  try {
    console.log('🗑️  Dropping all tables...');
    
    // Drop tables in correct dependency order (most dependent first)
    const dropQueries = [
      'DROP TABLE IF EXISTS "AppointmentServiceStatuses" CASCADE;',
      'DROP TABLE IF EXISTS "Messages" CASCADE;',
      'DROP TABLE IF EXISTS "Conversations" CASCADE;',
      'DROP TABLE IF EXISTS "Reviews" CASCADE;',
      'DROP TABLE IF EXISTS "Referrals" CASCADE;',
      'DROP TABLE IF EXISTS "Notifications" CASCADE;',
      'DROP TABLE IF EXISTS "Subscriptions" CASCADE;',
      'DROP TABLE IF EXISTS "Appointments" CASCADE;',
      'DROP TABLE IF EXISTS "Services" CASCADE;',
      'DROP TABLE IF EXISTS "Socials" CASCADE;',
      'DROP TABLE IF EXISTS "Schedules" CASCADE;',
      'DROP TABLE IF EXISTS "Users" CASCADE;',
      'DROP TABLE IF EXISTS "Marketplaces" CASCADE;',
      'DROP TABLE IF EXISTS "SubscriptionPlans" CASCADE;',
      'DROP TABLE IF EXISTS "SequelizeMeta" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Appointments_paymentStatus" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Appointments_status" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Conversations_status" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Messages_messageType" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Notifications_type" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Referrals_status" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Reviews_status" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Reviews_type" CASCADE;',
      'DROP TYPE IF EXISTS "enum_SubscriptionPlans_interval" CASCADE;',
      'DROP TYPE IF EXISTS "enum_SubscriptionPlans_userRole" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Subscriptions_planType" CASCADE;',
      'DROP TYPE IF EXISTS "enum_Subscriptions_status" CASCADE;'
    ];

    for (const query of dropQueries) {
      try {
        await sequelize.query(query);
        console.log(`✅ Executed: ${query}`);
      } catch (error) {
        console.log(`⚠️  Skipped: ${query} (${error.message})`);
      }
    }

    console.log('🎉 All tables dropped successfully!');
    console.log('💡 Now run: npm run migrate');
    
  } catch (error) {
    console.error('❌ Error dropping tables:', error);
  } finally {
    await sequelize.close();
  }
}

dropAllTables();

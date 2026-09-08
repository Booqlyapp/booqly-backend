# Booqly Server Installation Guide

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+ (for caching and sessions)
- AWS Account (for S3, SQS, Textract, Rekognition)
- Stripe Account

## Step 1: Install Dependencies

Run the following command to install all required dependencies:

```bash
npm install
```

If you encounter any issues, try:

```bash
npm install --legacy-peer-deps
```

## Step 2: Environment Configuration

Update your `.env` file with all required variables:

```env
# Environment
NODE_ENV=development

# App
APP_PORT=3000

# Database
DEV_DB_USERNAME=postgres
DEV_DB_PASSWORD=your_password
DEV_DB_NAME=booqly_dev
DEV_DB_HOST=localhost
DEV_DB_PORT=5432

# JWT
JWT_SECRET_KEY=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=90d

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=booqly-dev-bucket
SQS_QUEUE_URL=your_sqs_queue_url

# Stripe Configuration
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Price IDs (create these in Stripe Dashboard)
STRIPE_CLIENT_PREMIUM_PRICE_ID=price_client_premium
STRIPE_SOLO_BASIC_PRICE_ID=price_solo_basic
STRIPE_SOLO_PRO_PRICE_ID=price_solo_pro
STRIPE_SOLO_PREMIUM_PRICE_ID=price_solo_premium
STRIPE_SUITE_STARTER_PRICE_ID=price_suite_starter
STRIPE_SUITE_GROWING_PRICE_ID=price_suite_growing
STRIPE_SUITE_PRO_PRICE_ID=price_suite_pro
STRIPE_SUITE_ELITE_PRICE_ID=price_suite_elite

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Email Configuration (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# SMS Configuration (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
```

## Step 3: Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE booqly_dev;
```

2. Run migrations to create all tables:
```bash
npx sequelize-cli db:migrate
```

3. Seed initial data (subscription plans):
```bash
npx sequelize-cli db:seed:all
```

## Step 4: Redis Setup

Install and start Redis:

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Windows:**
Download from: https://redis.io/download

## Step 5: Create Database Migrations

Run the following commands to create all necessary database tables:

```bash
# Create migration for enhanced users table
npx sequelize-cli migration:generate --name enhance-users-table

# Create migration for subscriptions
npx sequelize-cli migration:generate --name create-subscriptions-table

# Create migration for subscription plans
npx sequelize-cli migration:generate --name create-subscription-plans-table

# Create migration for reviews
npx sequelize-cli migration:generate --name create-reviews-table

# Create migration for conversations
npx sequelize-cli migration:generate --name create-conversations-table

# Create migration for messages
npx sequelize-cli migration:generate --name create-messages-table

# Create migration for notifications
npx sequelize-cli migration:generate --name create-notifications-table

# Create migration for referrals
npx sequelize-cli migration:generate --name create-referrals-table
```

## Step 6: Stripe Setup

1. Follow the detailed Stripe setup guide in `STRIPE_SETUP_GUIDE.md`
2. Create all products and prices in Stripe Dashboard
3. Set up webhook endpoint
4. Update environment variables with Stripe keys

## Step 7: AWS Setup

1. Configure AWS credentials
2. Create S3 bucket for file uploads
3. Set up SQS queue for document processing
4. Configure IAM roles and permissions

## Step 8: Start the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Step 9: Verify Installation

1. Check server is running: `http://localhost:3000`
2. Test database connection
3. Verify Stripe webhook endpoint
4. Test file upload to S3
5. Check Redis connection

## Troubleshooting

### Common Issues:

1. **TypeScript errors**: Run `npm run build` to check for compilation errors
2. **Database connection**: Verify PostgreSQL is running and credentials are correct
3. **Stripe webhooks**: Use Stripe CLI for local testing
4. **AWS permissions**: Ensure IAM user has required permissions
5. **Redis connection**: Check if Redis server is running

### Development Tools:

- **Database GUI**: pgAdmin or DBeaver
- **Redis GUI**: RedisInsight
- **API Testing**: Postman or Insomnia
- **Stripe Testing**: Stripe CLI

## Next Steps

After successful installation:

1. Set up monitoring and logging
2. Configure production database
3. Set up CI/CD pipeline
4. Configure production Stripe account
5. Set up domain and SSL certificates
6. Configure production AWS resources

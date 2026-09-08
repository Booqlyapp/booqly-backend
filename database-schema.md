# Booqly Database Schema Design

## Core Tables

### 1. Users (Enhanced)
```sql
- id: UUID (PK)
- name: STRING
- email: STRING (UNIQUE)
- password: STRING (HASHED)
- phone: STRING
- role: ENUM('client', 'solo', 'suite')
- status: ENUM('pending', 'verified', 'rejected')
- accountVerified: BOOLEAN
- profilePic: STRING (S3 URL)
- stripeCustomerId: STRING
- currentSubscriptionId: UUID (FK)
- referralCode: STRING (UNIQUE)
- referredBy: UUID (FK to Users)
- freeBookingUsed: BOOLEAN (for clients)
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
- deletedAt: TIMESTAMP (soft delete)
```

### 2. Subscriptions
```sql
- id: UUID (PK)
- userId: UUID (FK to Users)
- planType: ENUM('client_free', 'client_referral', 'client_paid', 'solo_basic', 'solo_pro', 'solo_premium', 'suite_starter', 'suite_growing', 'suite_pro', 'suite_elite')
- stripeSubscriptionId: STRING
- status: ENUM('active', 'canceled', 'past_due', 'unpaid', 'trialing')
- currentPeriodStart: TIMESTAMP
- currentPeriodEnd: TIMESTAMP
- trialEnd: TIMESTAMP
- cancelAtPeriodEnd: BOOLEAN
- metadata: JSONB
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

### 3. Subscription Plans
```sql
- id: UUID (PK)
- name: STRING
- stripePriceId: STRING
- userRole: ENUM('client', 'solo', 'suite')
- price: DECIMAL
- interval: ENUM('month', 'year')
- features: JSONB
- isActive: BOOLEAN
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

### 4. Reviews
```sql
- id: UUID (PK)
- clientId: UUID (FK to Users)
- providerId: UUID (FK to Users)
- appointmentId: UUID (FK to Appointments)
- rating: INTEGER (1-5)
- comment: TEXT
- type: ENUM('verified', 'semi_verified')
- proofDocument: STRING (S3 URL for semi-verified)
- status: ENUM('pending', 'approved', 'rejected')
- isPublic: BOOLEAN
- providerResponse: TEXT
- respondedAt: TIMESTAMP
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

### 5. Messages
```sql
- id: UUID (PK)
- conversationId: UUID (FK to Conversations)
- senderId: UUID (FK to Users)
- content: TEXT
- messageType: ENUM('text', 'image', 'system')
- attachments: JSONB
- isRead: BOOLEAN
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
- deletedAt: TIMESTAMP
```

### 6. Conversations
```sql
- id: UUID (PK)
- clientId: UUID (FK to Users)
- providerId: UUID (FK to Users)
- status: ENUM('pending', 'active', 'blocked')
- clientMessageCount: INTEGER (for 3-message rule)
- providerHasResponded: BOOLEAN
- lastMessageAt: TIMESTAMP
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

### 7. Notifications
```sql
- id: UUID (PK)
- userId: UUID (FK to Users)
- type: ENUM('booking_confirmation', 'booking_reminder', 'message', 'review', 'payment', 'subscription')
- title: STRING
- content: TEXT
- data: JSONB
- channels: JSONB (push, sms, email, in_app)
- isRead: BOOLEAN
- sentAt: TIMESTAMP
- createdAt: TIMESTAMP
```

### 8. Referrals
```sql
- id: UUID (PK)
- referrerId: UUID (FK to Users - provider)
- referredUserId: UUID (FK to Users - client)
- referralCode: STRING
- status: ENUM('active', 'inactive')
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

### 9. Analytics
```sql
- id: UUID (PK)
- userId: UUID (FK to Users)
- metric: STRING
- value: DECIMAL
- metadata: JSONB
- date: DATE
- createdAt: TIMESTAMP
```

### 10. Waitlists
```sql
- id: UUID (PK)
- clientId: UUID (FK to Users)
- providerId: UUID (FK to Users)
- serviceId: UUID (FK to Services)
- preferredDateTime: TIMESTAMP
- notes: TEXT
- status: ENUM('active', 'notified', 'claimed', 'expired')
- notifiedAt: TIMESTAMP
- expiresAt: TIMESTAMP
- createdAt: TIMESTAMP
- updatedAt: TIMESTAMP
```

## Enhanced Existing Tables

### Users (Add subscription fields)
- Add: stripeCustomerId, currentSubscriptionId, referralCode, referredBy, freeBookingUsed

### Appointments (Add payment fields)
- Add: stripePaymentIntentId, tipAmount, totalAmount, platformFee

### Marketplaces (Add team management)
- Add: teamSettings, policySettings, googleBusinessId

## Relationships

1. Users -> Subscriptions (1:many)
2. Users -> Reviews (1:many as client and provider)
3. Users -> Messages (1:many)
4. Users -> Conversations (many:many through client/provider)
5. Users -> Notifications (1:many)
6. Users -> Referrals (1:many as referrer and referred)
7. Users -> Analytics (1:many)
8. Users -> Waitlists (1:many)
9. Appointments -> Reviews (1:1)
10. Conversations -> Messages (1:many)

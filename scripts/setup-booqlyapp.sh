#!/bin/bash

# Booqly Server Setup Script for api.booqlyapp.com
# Run this script on your new VPS

set -e

echo "🚀 Setting up Booqly Server for api.booqlyapp.com..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root. Please run with: sudo ./setup-booqlyapp.sh"
   exit 1
fi

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 18.x
print_status "Installing Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Verify Node.js installation
node_version=$(node --version)
npm_version=$(npm --version)
print_status "Node.js version: $node_version"
print_status "npm version: $npm_version"

# Install PostgreSQL
print_status "Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib

# Install PM2 globally
print_status "Installing PM2 process manager..."
npm install -g pm2

# Install Nginx
print_status "Installing Nginx..."
apt install -y nginx

# Install Git
print_status "Installing Git..."
apt install -y git

# Install Certbot for SSL
print_status "Installing Certbot for SSL certificates..."
apt install -y certbot python3-certbot-nginx

# Install additional tools
print_status "Installing additional tools..."
apt install -y curl wget unzip htop ufw

# Setup PostgreSQL database
print_status "Setting up PostgreSQL database..."
su - postgres -c "psql << EOF
CREATE USER booqly_user WITH PASSWORD 'booqly_secure_password_2024';
CREATE DATABASE booqly_production OWNER booqly_user;
GRANT ALL PRIVILEGES ON DATABASE booqly_production TO booqly_user;
\q
EOF"

print_status "PostgreSQL database 'booqly_production' created with user 'booqly_user'"

# Create application directory
print_status "Creating application directory..."
mkdir -p /var/www/booqly-server

# Clone repository (you'll need to update this URL)
print_status "Cloning Booqly server repository..."
cd /var/www
if [ ! -d "booqly-server" ]; then
    print_warning "Please update the repository URL in this script before running"
    print_warning "git clone https://github.com/YOUR_USERNAME/booqly-server.git"
    # Uncomment and update the line below with your actual repository URL
    # git clone https://github.com/YOUR_USERNAME/booqly-server.git
else
    print_status "Repository already exists, pulling latest changes..."
    cd booqly-server
    git pull origin main
fi

# Navigate to application directory
cd /var/www/booqly-server

# Install dependencies
print_status "Installing application dependencies..."
npm ci --production

# Build application
print_status "Building TypeScript application..."
npm run build

# Initialize upload directories
print_status "Initializing upload directories..."
npm run init:uploads

# Set proper permissions for uploads
print_status "Setting permissions for upload directories..."
chown -R www-data:www-data uploads/
chmod -R 755 uploads/

# Setup firewall
print_status "Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80
ufw allow 443
ufw --force enable

# Create log directories
print_status "Creating log directories..."
mkdir -p /var/log/pm2
chown -R www-data:www-data /var/log/pm2

# Setup PM2 startup
print_status "Setting up PM2 startup..."
pm2 startup
print_warning "Please run the command that PM2 displays above to complete startup setup"

# Create Nginx configuration
print_status "Creating Nginx configuration..."
tee /etc/nginx/sites-available/booqlyapp > /dev/null << 'EOF'
# Rate Limiting Zone (add to /etc/nginx/nginx.conf in http block)
# limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# Redirect HTTP to HTTPS for api.booqlyapp.com
server {
    listen 80;
    server_name api.booqlyapp.com;
    return 301 https://$server_name$request_uri;
}

# API Server Configuration
server {
    listen 443 ssl http2;
    server_name api.booqlyapp.com;

    # SSL Certificates (will be configured by Certbot)
    ssl_certificate /etc/letsencrypt/live/api.booqlyapp.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.booqlyapp.com/privkey.pem;

    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # CORS Headers for API
    add_header Access-Control-Allow-Origin "https://booqlyapp.com" always;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization" always;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;

    # Rate Limiting
    limit_req zone=api burst=20 nodelay;

    # Health Check (no rate limit)
    location /health {
        proxy_pass http://localhost:3000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.io Support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Endpoints
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # File upload support
        client_max_body_size 50M;
    }

    # Serve uploaded files
    location /uploads/ {
        alias /var/www/booqly-server/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/booqly-api.access.log;
    error_log /var/log/nginx/booqly-api.error.log;
}
EOF

# Enable the site
print_status "Enabling Nginx site..."
ln -sf /etc/nginx/sites-available/booqlyapp /etc/nginx/sites-enabled/

# Add rate limiting to main nginx.conf
print_status "Adding rate limiting to Nginx configuration..."
if ! grep -q "limit_req_zone" /etc/nginx/nginx.conf; then
    sed -i '/http {/a\\tlimit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;' /etc/nginx/nginx.conf
fi

# Test Nginx configuration
print_status "Testing Nginx configuration..."
nginx -t

# Restart Nginx
print_status "Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

# Create backup script
print_status "Creating database backup script..."
tee /usr/local/bin/backup-booqly.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/booqly"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="booqly_production"
DB_USER="booqly_user"

# Create backup directory
mkdir -p $BACKUP_DIR

# Create database backup
PGPASSWORD="booqly_secure_password_2024" pg_dump -U $DB_USER -h localhost $DB_NAME > $BACKUP_DIR/booqly_backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "booqly_backup_*.sql" -mtime +7 -delete

echo "Backup completed: booqly_backup_$DATE.sql"
EOF

chmod +x /usr/local/bin/backup-booqly.sh

# Create deployment script
print_status "Creating deployment script..."
tee /var/www/booqly-server/deploy.sh > /dev/null << 'EOF'
#!/bin/bash

set -e

echo "🚀 Starting Booqly Server Deployment..."

# Navigate to application directory
cd /var/www/booqly-server

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Build application
echo "🔨 Building application..."
npm run build

# Run database migrations
echo "🗄️ Running database migrations..."
npx sequelize-cli db:migrate --env production

# Restart application
echo "🔄 Restarting application..."
pm2 restart booqly-server

# Check application status
echo "✅ Checking application status..."
pm2 status booqly-server

echo "🎉 Deployment completed successfully!"
EOF

chmod +x /var/www/booqly-server/deploy.sh

print_status "✅ Server setup completed successfully!"
echo ""
print_warning "📝 IMPORTANT NEXT STEPS:"
echo "1. Create your .env file with production configuration:"
echo "   cp .env.example .env"
echo "   nano .env"
echo ""
echo "2. Update the repository URL in this script and re-run if needed"
echo ""
echo "3. Run database migrations:"
echo "   cd /var/www/booqly-server"
echo "   npx sequelize-cli db:migrate --env production"
echo ""
echo "4. Install SSL certificate:"
echo "   sudo certbot --nginx -d api.booqlyapp.com"
echo ""
echo "5. Start the application:"
echo "   pm2 start ecosystem.config.js --env production"
echo "   pm2 save"
echo ""
echo "6. Test the deployment:"
echo "   curl https://api.booqlyapp.com/health"
echo ""
print_status "Your Booqly server will be available at: https://api.booqlyapp.com"

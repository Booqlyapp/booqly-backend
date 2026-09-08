#!/bin/bash

# Booqly Server Setup Script for Ubuntu VPS
# Run this script on your Hostinger VPS

set -e

echo "🚀 Setting up Booqly Server on Ubuntu VPS..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 22.x
echo "📦 Installing Node.js 22.x..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Install PM2 globally
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Install Git
echo "📦 Installing Git..."
sudo apt install -y git

# Setup application directory permissions (if repository already exists)
if [ -d "/var/www/booqly-server" ]; then
    echo "📁 Setting permissions for existing repository..."
    sudo chown -R $USER:$USER /var/www/booqly-server
else
    echo "📁 Creating application directory..."
    sudo mkdir -p /var/www/booqly-server
    sudo chown $USER:$USER /var/www/booqly-server
    
    # Clone repository if directory doesn't exist
    echo "📥 Cloning repository..."
    cd /var/www
    git clone git@github.com:hanzallahmsd/booqly-server.git
fi

# Navigate to application directory
cd /var/www/booqly-server

# Setup PostgreSQL database
echo "🗄️ Setting up PostgreSQL database..."
sudo -u postgres createuser --interactive --pwprompt booqly_user
sudo -u postgres createdb -O booqly_user booqly_production

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3000
sudo ufw --force enable

# Install dependencies
echo "📦 Installing application dependencies..."
npm ci --production

# Setup PM2 startup
echo "⚙️ Setting up PM2 startup..."
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER

echo "✅ Server setup complete!"
echo "📝 Next steps:"
echo "1. Copy your .env.production file to /var/www/booqly-server/.env"
echo "2. Run 'npm run migrate' to setup database"
echo "3. Start the application with 'pm2 start ecosystem.config.js'"
echo "4. Configure Nginx (see nginx.conf file)"
echo "5. Setup SSL certificate with Let's Encrypt"

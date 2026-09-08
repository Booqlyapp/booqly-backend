#!/bin/bash

# SSL Certificate Setup Script using Let's Encrypt
# Run this script after setting up Nginx and DNS

set -e

echo "🔒 Setting up SSL certificates with Let's Encrypt..."

# Install Certbot
echo "📦 Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# Stop Nginx temporarily
echo "⏸️ Stopping Nginx..."
sudo systemctl stop nginx

# Obtain SSL certificates
echo "📜 Obtaining SSL certificates..."
sudo certbot certonly --standalone -d api.welcomeshah.com
sudo certbot certonly --standalone -d welcomeshah.com -d www.welcomeshah.com

# Copy Nginx configuration
echo "⚙️ Setting up Nginx configuration..."
sudo cp /var/www/booqly-server/nginx.conf /etc/nginx/sites-available/booqly-server
sudo ln -sf /etc/nginx/sites-available/booqly-server /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
echo "🧪 Testing Nginx configuration..."
sudo nginx -t

# Start Nginx
echo "▶️ Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Setup automatic certificate renewal
echo "🔄 Setting up automatic certificate renewal..."
sudo crontab -l | grep -q certbot || (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --nginx") | sudo crontab -

echo "✅ SSL setup complete!"
echo "🌐 Your API will be available at: https://api.welcomeshah.com"
echo "🔒 Certificates will auto-renew every 12 hours"

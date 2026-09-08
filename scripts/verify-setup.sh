#!/bin/bash

# Verification script for Booqly Server deployment
# Run this after initial setup to verify everything is working

echo "🔍 Verifying Booqly Server Setup..."

# Check Node.js version
echo "📦 Checking Node.js version..."
node_version=$(node -v)
echo "Node.js version: $node_version"

if [[ $node_version == v22* ]]; then
    echo "✅ Node.js 22.x is installed correctly"
else
    echo "❌ Expected Node.js 22.x, got $node_version"
fi

# Check npm version
echo "📦 Checking npm version..."
npm_version=$(npm -v)
echo "npm version: $npm_version"

# Check PostgreSQL
echo "🗄️ Checking PostgreSQL..."
if systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL is not running"
fi

# Check PM2
echo "⚙️ Checking PM2..."
if command -v pm2 &> /dev/null; then
    echo "✅ PM2 is installed"
    pm2 status
else
    echo "❌ PM2 is not installed"
fi

# Check Nginx
echo "🌐 Checking Nginx..."
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx is not running"
fi

# Check application directory
echo "📁 Checking application directory..."
if [ -d "/var/www/booqly-server" ]; then
    echo "✅ Application directory exists"
    cd /var/www/booqly-server
    
    # Check if it's a git repository
    if [ -d ".git" ]; then
        echo "✅ Git repository is set up"
        echo "Current branch: $(git branch --show-current)"
        echo "Last commit: $(git log -1 --oneline)"
    else
        echo "❌ Not a git repository"
    fi
    
    # Check if node_modules exists
    if [ -d "node_modules" ]; then
        echo "✅ Dependencies are installed"
    else
        echo "❌ Dependencies not installed"
    fi
    
    # Check if .env exists
    if [ -f ".env" ]; then
        echo "✅ Environment file exists"
    else
        echo "❌ Environment file missing"
    fi
    
else
    echo "❌ Application directory does not exist"
fi

# Check firewall status
echo "🔥 Checking firewall..."
ufw_status=$(sudo ufw status | head -1)
echo "UFW status: $ufw_status"

# Check SSH connection to GitHub
echo "🔑 Testing GitHub SSH connection..."
ssh_test=$(ssh -T git@github.com 2>&1)
if [[ $ssh_test == *"successfully authenticated"* ]]; then
    echo "✅ GitHub SSH connection working"
else
    echo "❌ GitHub SSH connection failed"
    echo "$ssh_test"
fi

# Test application health (if running)
echo "🏥 Testing application health..."
if curl -f http://localhost:3000/health &> /dev/null; then
    echo "✅ Application is responding on port 3000"
else
    echo "❌ Application not responding on port 3000"
fi

echo ""
echo "🎯 Verification complete!"
echo "📋 Next steps if any issues found:"
echo "1. Fix any ❌ issues above"
echo "2. Check logs: pm2 logs booqly-server"
echo "3. Restart services if needed"

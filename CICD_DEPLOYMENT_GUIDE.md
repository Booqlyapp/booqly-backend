# 🚀 Booqly Server CI/CD Deployment Guide

## 📋 Complete Setup Checklist

### **🏠 On Your Local Machine**

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add CI/CD configuration"
   git push origin main
   ```

2. **Update Repository URL in setup-server.sh**
   - Edit `scripts/setup-server.sh`
   - Replace `YOUR_USERNAME` with your actual GitHub username
   

### **🌐 On Namecheap (DNS Configuration)**

1. **Login to Namecheap Dashboard**
   - Go to Domain List → welcomeshah.com → Manage

2. **Configure DNS Records**
   ```
   Type    Host    Value                   TTL
   A       @       YOUR_VPS_IP_ADDRESS     300
   A       www     YOUR_VPS_IP_ADDRESS     300
   A       api     YOUR_VPS_IP_ADDRESS     300
   CNAME   *       welcomeshah.com         300
   ```

3. **Wait for DNS Propagation** (5-30 minutes)
   - Test with: `nslookup api.welcomeshah.com`

### **🖥️ On Hostinger VPS (Ubuntu Server)**

#### **Phase 1: Initial Server Setup**

1. **Connect to VPS**
   ```bash
   ssh root@YOUR_VPS_IP
   # or
   ssh username@YOUR_VPS_IP
   ```

2. **Create Non-Root User (if using root)**
   ```bash
   adduser deployer
   usermod -aG sudo deployer
   su - deployer
   ```

3. **Generate SSH Key for GitHub** (Required for private repository)
   ```bash
   ssh-keygen -t ed25519 -C "your-email@example.com"
   cat ~/.ssh/id_ed25519.pub
   # Copy this key to GitHub → Settings → SSH Keys
   
   # Test SSH connection
   ssh -T git@github.com
   # Should show: "Hi hanzallahmsd! You've successfully authenticated..."
   ```

4. **Clone Repository First**
   ```bash
   cd /var/www
   sudo git clone git@github.com:hanzallahmsd/booqly-server.git
   sudo chown -R $USER:$USER booqly-server
   ```

5. **Run Server Setup Script** (Installs Node.js 22.x)
   ```bash
   cd /var/www/booqly-server
   chmod +x scripts/setup-server.sh
   ./scripts/setup-server.sh
   ```

#### **Phase 2: Application Configuration**

6. **Configure Environment Variables**
   ```bash
   cd /var/www/booqly-server
   cp .env.production.example .env
   nano .env
   # Update all production values
   ```

7. **Setup Database**
   ```bash
   # Create database user and database (if not done by script)
   sudo -u postgres psql
   CREATE USER booqly_user WITH PASSWORD 'your_secure_password';
   CREATE DATABASE booqly_production OWNER booqly_user;
   GRANT ALL PRIVILEGES ON DATABASE booqly_production TO booqly_user;
   \q

   # Run migrations
   npm run migrate
   ```

7. **Test Application**
   ```bash
   npm run build
   npm start
   # Test in another terminal: curl http://localhost:3000/health
   ```

#### **Phase 3: Production Services**

8. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   # Follow the displayed command
   ```

9. **Setup Nginx & SSL**
   ```bash
   # Run SSL setup script
   chmod +x scripts/setup-ssl.sh
   ./scripts/setup-ssl.sh
   ```

10. **Verify Deployment**
    ```bash
    curl https://api.welcomeshah.com/health
    ```

### **🔧 On GitHub (Repository Settings)**

#### **Setup GitHub Secrets**

1. **Go to Repository → Settings → Secrets and Variables → Actions**

2. **Add Repository Secrets**
   ```
   VPS_HOST=YOUR_VPS_IP_ADDRESS
   VPS_USERNAME=deployer
   VPS_PORT=22
   VPS_SSH_KEY=YOUR_PRIVATE_SSH_KEY
   ```

3. **Get SSH Private Key**
   ```bash
   # On your VPS
   cat ~/.ssh/id_rsa
   # Copy entire private key including headers
   ```

#### **Setup Branch Protection (Optional)**

1. **Go to Settings → Branches**
2. **Add Rule for `main` branch**
   - Require status checks
   - Require branches to be up to date

### **🔄 Testing CI/CD Pipeline**

1. **Make a Test Change**
   ```bash
   # On local machine
   echo "console.log('CI/CD Test');" >> src/test-cicd.js
   git add .
   git commit -m "Test CI/CD pipeline"
   git push origin main
   ```

2. **Monitor GitHub Actions**
   - Go to GitHub → Actions tab
   - Watch the deployment process

3. **Verify Deployment**
   ```bash
   curl https://api.welcomeshah.com/health
   ```

## 🛠️ **Production Configuration Files**

### **Environment Variables (.env)**
```env
NODE_ENV=production
APP_PORT=3000
DEV_DB_HOST=localhost
DEV_DB_PORT=5432
DEV_DB_NAME=booqly_production
DEV_DB_USERNAME=booqly_user
DEV_DB_PASSWORD=your_secure_password
JWT_SECRET_KEY=your-super-secure-jwt-secret
# ... other production values
```

### **PM2 Ecosystem (ecosystem.config.js)**
Already configured in your project.

## 🚨 **Troubleshooting**

### **Common Issues**

1. **SSH Connection Failed**
   ```bash
   # Check SSH key permissions
   chmod 600 ~/.ssh/id_rsa
   
   # Test SSH connection
   ssh -T git@github.com
   ```

2. **Database Connection Failed**
   ```bash
   # Check PostgreSQL status
   sudo systemctl status postgresql
   
   # Check database exists
   sudo -u postgres psql -l
   ```

3. **Nginx Configuration Error**
   ```bash
   # Test configuration
   sudo nginx -t
   
   # Check logs
   sudo tail -f /var/log/nginx/error.log
   ```

4. **PM2 Process Issues**
   ```bash
   # Check PM2 status
   pm2 status
   
   # View logs
   pm2 logs booqly-server
   
   # Restart application
   pm2 restart booqly-server
   ```

### **Monitoring Commands**

```bash
# Check application status
pm2 status

# View application logs
pm2 logs booqly-server

# Monitor system resources
htop

# Check Nginx status
sudo systemctl status nginx

# Check SSL certificate
sudo certbot certificates

# Test API endpoint
curl -I https://api.welcomeshah.com/health
```

## 🎉 **Success Indicators**

- ✅ GitHub Actions workflow completes successfully
- ✅ `https://api.welcomeshah.com/health` returns 200 OK
- ✅ SSL certificate is valid (green lock in browser)
- ✅ PM2 shows application as "online"
- ✅ Nginx access logs show incoming requests

## 📞 **Support**

If you encounter issues:
1. Check the troubleshooting section above
2. Review GitHub Actions logs
3. Check server logs: `pm2 logs booqly-server`
4. Verify DNS propagation: `nslookup api.welcomeshah.com`

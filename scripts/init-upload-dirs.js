#!/usr/bin/env node

/**
 * Initialize upload directories for the Booqly server
 * This script creates all necessary upload directories on deployment
 */

const fs = require('fs');
const path = require('path');

// Define all upload directories needed
const uploadDirectories = [
  'uploads',
  'uploads/profile-pics',
  'uploads/marketplace-images',
  'uploads/marketplace-portfolio',
  'uploads/verification-docs',
  'uploads/verification-docs/identityCard',
  'uploads/verification-docs/passport',
  'uploads/verification-docs/driversLicense',
  'uploads/verification-docs/cosmetology',
  'uploads/verification-docs/irsEin',
  'uploads/verification-docs/llcCertificate',
  'uploads/videos',
  'uploads/video-thumbnails',
  'uploads/misc'
];

console.log('🚀 Initializing upload directories...\n');

let createdCount = 0;
let existingCount = 0;

uploadDirectories.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  
  if (!fs.existsSync(fullPath)) {
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✅ Created: ${dir}`);
      createdCount++;
    } catch (error) {
      console.error(`❌ Failed to create ${dir}:`, error.message);
    }
  } else {
    console.log(`📁 Exists: ${dir}`);
    existingCount++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Created: ${createdCount} directories`);
console.log(`   Existing: ${existingCount} directories`);
console.log(`   Total: ${uploadDirectories.length} directories`);

// Create a .gitkeep file in each directory to ensure they're tracked by git
console.log('\n📝 Creating .gitkeep files...');

uploadDirectories.forEach(dir => {
  const gitkeepPath = path.join(process.cwd(), dir, '.gitkeep');
  
  if (!fs.existsSync(gitkeepPath)) {
    try {
      fs.writeFileSync(gitkeepPath, '# This file ensures the directory is tracked by git\n');
      console.log(`✅ Created .gitkeep in ${dir}`);
    } catch (error) {
      console.error(`❌ Failed to create .gitkeep in ${dir}:`, error.message);
    }
  }
});

console.log('\n🎉 Upload directories initialization complete!');
console.log('📋 All directories are now ready for file uploads.');

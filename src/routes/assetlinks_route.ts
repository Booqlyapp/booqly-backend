import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * @route GET /.well-known/assetlinks.json
 * @desc Serve Android App Links verification file
 * @access Public
 */
router.get('/.well-known/assetlinks.json', (req, res) => {
  try {
    const assetlinksPath = path.join(
      __dirname,
      '../../.well-known/assetlinks.json'
    );
    res.type('application/json');
    res.send(fs.readFileSync(assetlinksPath, 'utf8'));
  } catch {
    res.status(404).json({ status: false, message: 'assetlinks not found' });
  }
});

/**
 * @route GET /.well-known/apple-app-site-association
 * @desc Serve iOS Universal Links association (no file extension; application/json)
 * @access Public
 */
router.get('/.well-known/apple-app-site-association', (req, res) => {
  try {
    const aasaPath = path.join(
      __dirname,
      '../../.well-known/apple-app-site-association'
    );
    res.type('application/json');
    res.send(fs.readFileSync(aasaPath, 'utf8'));
  } catch {
    res.status(404).json({ status: false, message: 'AASA not found' });
  }
});

export default router;

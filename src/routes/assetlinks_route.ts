import { Router } from 'express';
import path from 'path';

const router = Router();

/**
 * @route GET /.well-known/assetlinks.json
 * @desc Serve Android App Links verification file
 * @access Public
 */
router.get('/.well-known/assetlinks.json', (req, res) => {
  const assetlinksPath = path.join(__dirname, '../../.well-known/assetlinks.json');
  console.log("Pathh: ", assetlinksPath);
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(assetlinksPath);
});

export default router;

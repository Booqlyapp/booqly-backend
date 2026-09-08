import { Router } from 'express';
import {
  addToFavorites,
  removeFromFavorites,
  getUserFavorites,
  checkFavoriteStatus,
} from '../controllers/favorite_controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const router = Router();

// Add marketplace to favorites
router.post('/add', authenticateToken, addToFavorites);

// Remove marketplace from favorites
router.delete('/remove/:marketplaceId', authenticateToken, removeFromFavorites);

// Get user's favorites
router.get('/list', authenticateToken, getUserFavorites);

// Check if marketplace is favorited
router.get('/check/:marketplaceId', authenticateToken, checkFavoriteStatus);

export default router;

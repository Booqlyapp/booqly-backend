import { Router } from 'express';
import {
  searchProviders,
  getFeaturedProviders,
  getNearbyProviders,
  getPopularServices,
  getSearchSuggestions,
  getTrendingSearches,
} from '../controllers/search.controller';

const router = Router();

// Search providers and services
router.get('/providers', searchProviders);

// Get featured providers
router.get('/featured', getFeaturedProviders);

// Get nearby providers
router.get('/nearby', getNearbyProviders);

// Get popular services
router.get('/services/popular', getPopularServices);

// Get search suggestions (autocomplete)
router.get('/suggestions', getSearchSuggestions);

// Get trending searches
router.get('/trending', getTrendingSearches);

export default router;

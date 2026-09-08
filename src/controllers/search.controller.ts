import { Response } from 'express';
import { SearchService } from '../services/search.service';
import { AuthRequest } from '../middlewares/auth.middleware';

/**
 * Search providers and services
 */
export const searchProviders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      q: query = '',
      category,
      subcategory,
      minPrice,
      maxPrice,
      rating,
      latitude,
      longitude,
      radius,
      sortBy,
      sortOrder,
      page = 1,
      limit = 20
    } = req.query;

    // Browsing the list itself is always allowed - the discovery paywall
    // (see SubscriptionService.canClientDiscoverProviders) is enforced when
    // a client opens a specific provider's profile, in getMarketplaceById.
    const filters: any = {};

    // Location filter
    if (latitude && longitude) {
      filters.location = {
        latitude: parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radius: radius ? parseFloat(radius as string) : 10,
      };
    }

    // Category filters
    if (category) filters.category = category as string;
    if (subcategory) filters.subcategory = subcategory as string;

    // Price range filter
    if (minPrice || maxPrice) {
      filters.priceRange = {
        min: minPrice ? parseFloat(minPrice as string) : 0,
        max: maxPrice ? parseFloat(maxPrice as string) : 10000,
      };
    }

    // Rating filter
    if (rating) filters.rating = parseFloat(rating as string);

    // Sorting
    if (sortBy) filters.sortBy = sortBy as string;
    if (sortOrder) filters.sortOrder = sortOrder as 'ASC' | 'DESC';

    const results = await SearchService.searchProviders(
      query as string,
      filters,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Search results retrieved successfully',
      data: results,
    });
  } catch (error) {
    console.error('Error searching providers:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to search providers',
    });
  }
};

/**
 * Get featured providers
 */
export const getFeaturedProviders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;

    const providers = await SearchService.getFeaturedProviders(parseInt(limit as string));

    res.status(200).json({
      status: true,
      message: 'Featured providers retrieved successfully',
      data: providers,
    });
  } catch (error) {
    console.error('Error fetching featured providers:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch featured providers',
    });
  }
};

/**
 * Get nearby providers
 */
export const getNearbyProviders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { latitude, longitude, radius = 10, limit = 20 } = req.query;

    if (!latitude || !longitude) {
      res.status(400).json({
        status: false,
        message: 'Latitude and longitude are required',
      });
      return;
    }

    const providers = await SearchService.getNearbyProviders(
      parseFloat(latitude as string),
      parseFloat(longitude as string),
      parseFloat(radius as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Nearby providers retrieved successfully',
      data: providers,
    });
  } catch (error) {
    console.error('Error fetching nearby providers:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch nearby providers',
    });
  }
};

/**
 * Get popular services
 */
export const getPopularServices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 20 } = req.query;

    const services = await SearchService.getPopularServices(parseInt(limit as string));

    res.status(200).json({
      status: true,
      message: 'Popular services retrieved successfully',
      data: services,
    });
  } catch (error) {
    console.error('Error fetching popular services:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch popular services',
    });
  }
};

/**
 * Get search suggestions
 */
export const getSearchSuggestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q: query, limit = 10 } = req.query;

    if (!query) {
      res.status(400).json({
        status: false,
        message: 'Query parameter is required',
      });
      return;
    }

    const suggestions = await SearchService.getSearchSuggestions(
      query as string,
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Search suggestions retrieved successfully',
      data: suggestions,
    });
  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch search suggestions',
    });
  }
};

/**
 * Get trending searches
 */
export const getTrendingSearches = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;

    const trending = await SearchService.getTrendingSearches(parseInt(limit as string));

    res.status(200).json({
      status: true,
      message: 'Trending searches retrieved successfully',
      data: trending,
    });
  } catch (error) {
    console.error('Error fetching trending searches:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch trending searches',
    });
  }
};

import { User } from '../models/user_model';
import { Marketplace } from '../models/marketplace_model';
import { Service } from '../models/service_model';
import { Review } from '../models/review_model';
import { Schedule } from '../models/schedule_model';
import { Social } from '../models/social_model';
import { ServiceAddOn } from '../models/service_addon_model';
import { Op } from 'sequelize';

interface SearchFilters {
  location?: {
    latitude: number;
    longitude: number;
    radius?: number; // in kilometers
  };
  category?: string;
  subcategory?: string;
  priceRange?: {
    min: number;
    max: number;
  };
  rating?: number;
  availability?: {
    date: string;
    time?: string;
  };
  sortBy?: 'distance' | 'rating' | 'price' | 'popularity';
  sortOrder?: 'ASC' | 'DESC';
}

interface SearchResult {
  providers: any[];
  services: any[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  filters: SearchFilters;
}

export class SearchService {
  
  /**
   * Search providers and services
   */
  static async searchProviders(
    query: string = '',
    filters: SearchFilters = {},
    page: number = 1,
    limit: number = 20
  ): Promise<SearchResult> {
    try {
      const offset = (page - 1) * limit;
      
      // If there's a query, search for providers that have services matching the query
      let providers: any[] = [];
      let count = 0;

      if (query && query.trim()) {
        // First, find services that match the query
        const matchingServices = await Service.findAll({
          where: {
            isActive: true,
            [Op.or]: [
              { name: { [Op.iLike]: `%${query}%` } },
              { description: { [Op.iLike]: `%${query}%` } },
              { category: { [Op.iLike]: `%${query}%` } },
              { subcategory: { [Op.iLike]: `%${query}%` } },
            ],
          },
          attributes: ['marketplaceId'],
          group: ['marketplaceId'],
        });

        const marketplaceIds = matchingServices.map(s => s.marketplaceId).filter(Boolean);

        if (marketplaceIds.length > 0) {
          // Find providers that own these marketplaces
          const result = await User.findAndCountAll({
            where: {
              role: { [Op.in]: ['solo', 'suite'] },
              status: 'verified',
            },
            include: [
              {
                model: Marketplace,
                as: 'marketplace',
                where: {
                  id: { [Op.in]: marketplaceIds },
                },
                required: true,
                include: [
                  {
                    model: Service,
                    as: 'services',
                    where: { isActive: true },
                    required: false,
                    attributes: ["id", "name", "category", "subcategory", "description", "price", "duration", "requireDeposit", "depositType", "depositAmount", "createdAt", "updatedAt"],
                    include: [{
                      model: ServiceAddOn,
                      as: 'addOns',
                      where: { deletedAt: null },
                      required: false,
                      attributes: ['id', 'title', 'price', 'isActive']
                    }]
                  },
                  {
                    model: Schedule,
                    as: 'schedule',
                    attributes: ["id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                  },
                  {
                    model: Social,
                    as: 'socials',
                    attributes: ["id", "insta", "tiktok", "facebook"],
                  },
                  {
                    model: User,
                    as: 'user',
                    attributes: ["id", "name", "email", "role"],
                  },
                ],
              },
            ],
            limit,
            offset,
            distinct: true,
          });

          providers = result.rows;
          count = result.count;
        }
      } else {
        // No query - get all verified providers
        const result = await User.findAndCountAll({
          where: {
            role: { [Op.in]: ['solo', 'suite'] },
            status: 'verified',
          },
          include: [
            {
              model: Marketplace,
              as: 'marketplace',
              required: true,
              include: [
                {
                  model: Service,
                  as: 'services',
                  where: { isActive: true },
                  required: false,
                  attributes: ["id", "name", "category", "subcategory", "description", "price", "duration", "requireDeposit", "depositType", "depositAmount", "createdAt", "updatedAt"],
                  include: [{
                    model: ServiceAddOn,
                    as: 'addOns',
                    where: { deletedAt: null },
                    required: false,
                    attributes: ['id', 'title', 'price', 'isActive']
                  }]
                },
                {
                  model: Schedule,
                  as: 'schedule',
                  attributes: ["id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
                },
                {
                  model: Social,
                  as: 'socials',
                  attributes: ["id", "insta", "tiktok", "facebook"],
                },
                {
                  model: User,
                  as: 'user',
                  attributes: ["id", "name", "email", "role"],
                },
              ],
            },
          ],
          limit,
          offset,
          distinct: true,
        });

        providers = result.rows;
        count = result.count;
      }

      // Enhance results with additional data
      const enhancedProviders = await this.enhanceProviderResults(providers, filters);

      // Search services separately
      const services = await this.searchServices(query, filters, page, limit);

      return {
        providers: enhancedProviders,
        services: services.services,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
        filters,
      };
    } catch (error) {
      console.error('Error searching providers:', error);
      throw error;
    }
  }

  /**
   * Get featured providers
   */
  static async getFeaturedProviders(limit: number = 10) {
    try {
      const providers = await User.findAll({
        where: {
          role: { [Op.in]: ['solo', 'suite'] },
          status: 'verified',
        },
        include: [
          {
            model: Marketplace,
            as: 'marketplace',
            required: true,
          },
          {
            model: Review,
            as: 'receivedReviews',
            where: { status: 'approved' },
            required: false,
          },
        ],
        order: [
          // Prioritize providers with premium subscriptions
          // Then by average rating
          // Then by review count
        ],
        limit,
      });

      return await this.enhanceProviderResults(providers);
    } catch (error) {
      console.error('Error fetching featured providers:', error);
      throw error;
    }
  }

  /**
   * Get nearby providers
   */
  static async getNearbyProviders(
    latitude: number,
    longitude: number,
    radius: number = 10,
    limit: number = 20
  ) {
    try {
      // Calculate distance using Haversine formula
      const providers = await User.findAll({
        where: {
          role: { [Op.in]: ['solo', 'suite'] },
          status: 'verified',
        },
        include: [
          {
            model: Marketplace,
            as: 'marketplace',
            required: true,
            where: {
              latitude: { [Op.ne]: null },
              longitude: { [Op.ne]: null },
            },
          },
        ],
        attributes: {
          include: [
            [
              User.sequelize!.literal(`
                6371 * acos(
                  cos(radians(${latitude})) * 
                  cos(radians("marketplace"."latitude")) * 
                  cos(radians("marketplace"."longitude") - radians(${longitude})) + 
                  sin(radians(${latitude})) * 
                  sin(radians("marketplace"."latitude"))
                )
              `),
              'distance'
            ]
          ]
        },
        having: User.sequelize!.where(
          User.sequelize!.literal('distance'),
          Op.lte,
          radius
        ),
        order: [[User.sequelize!.literal('distance'), 'ASC']],
        limit,
      });

      return await this.enhanceProviderResults(providers);
    } catch (error) {
      console.error('Error fetching nearby providers:', error);
      throw error;
    }
  }

  /**
   * Get popular services
   */
  static async getPopularServices(limit: number = 20) {
    try {
      const services = await Service.findAll({
        where: {
          isActive: true,
        },
        include: [
          {
            model: User,
            as: 'marketplace',
            where: {
              status: 'verified',
            },
            include: [
              {
                model: Marketplace,
                as: 'marketplace',
              },
            ],
          },
        ],
        // Order by appointment count (would need to join with appointments)
        order: [['createdAt', 'DESC']],
        limit,
      });

      return services;
    } catch (error) {
      console.error('Error fetching popular services:', error);
      throw error;
    }
  }

  /**
   * Search suggestions/autocomplete
   */
  static async getSearchSuggestions(query: string, limit: number = 10) {
    try {
      if (!query || query.length < 2) {
        return {
          providers: [],
          services: [],
          categories: [],
        };
      }

      const [providers, services, categories] = await Promise.all([
        // Provider suggestions
        User.findAll({
          where: {
            role: { [Op.in]: ['solo', 'suite'] },
            status: 'verified',
            [Op.or]: [
              { name: { [Op.iLike]: `%${query}%` } },
            ],
          },
          include: [
            {
              model: Marketplace,
              as: 'marketplace',
              where: {
                [Op.or]: [
                  { businessName: { [Op.iLike]: `%${query}%` } },
                  { bio: { [Op.iLike]: `%${query}%` } },
                ],
              },
              required: false,
            },
          ],
          attributes: ['id', 'name'],
          limit: Math.floor(limit / 3),
        }),

        // Service suggestions
        Service.findAll({
          where: {
            isActive: true,
            [Op.or]: [
              { name: { [Op.iLike]: `%${query}%` } },
              { description: { [Op.iLike]: `%${query}%` } },
            ],
          },
          include: [
            {
              model: Marketplace,
              as: 'marketplace',
              attributes: ['id', 'businessName'],
              required: true,
            },
          ],
          attributes: ['id', 'name', 'category', 'subcategory', 'marketplaceId'],
          limit: Math.floor(limit / 3),
        }),

        // Category suggestions
        Service.findAll({
          where: {
            isActive: true,
            [Op.or]: [
              { category: { [Op.iLike]: `%${query}%` } },
              { subcategory: { [Op.iLike]: `%${query}%` } },
            ],
          },
          attributes: ['category', 'subcategory'],
          group: ['category', 'subcategory'],
          limit: Math.floor(limit / 3),
        }),
      ]);

      return {
        providers: providers.map(p => ({
          id: p.id,
          name: p.name,
          businessName: (p as any).marketplace?.businessName,
          type: 'provider',
        })),
        services: services.map(s => ({
          id: s.id,
          name: s.name,
          category: s.category,
          subcategory: s.subcategory,
          marketplaceId: s.marketplaceId,
          marketplaceName: (s as any).marketplace?.businessName || 'Unknown Marketplace',
          type: 'service',
        })),
        categories: categories.map(c => ({
          category: c.category,
          subcategory: c.subcategory,
          type: 'category',
        })),
      };
    } catch (error) {
      console.error('Error fetching search suggestions:', error);
      throw error;
    }
  }

  /**
   * Get trending searches
   */
  static async getTrendingSearches(limit: number = 10) {
    try {
      // This would typically be based on search analytics
      // For now, return popular categories
      const trending = await Service.findAll({
        where: {
          isActive: true,
        },
        attributes: [
          'category',
          [Service.sequelize!.fn('COUNT', Service.sequelize!.col('id')), 'count'],
        ],
        group: ['category'],
        order: [[Service.sequelize!.fn('COUNT', Service.sequelize!.col('id')), 'DESC']],
        limit,
        raw: true,
      });

      return trending.map((item: any) => ({
        term: item.category,
        count: parseInt(item.count),
        type: 'category',
      }));
    } catch (error) {
      console.error('Error fetching trending searches:', error);
      return [];
    }
  }

  // Private helper methods

  private static buildWhereConditions(query: string, filters: SearchFilters) {
    const conditions: any = {
      user: {},
      marketplace: {},
      service: {},
    };

    // Text search
    if (query) {
      conditions.user[Op.or] = [
        { name: { [Op.iLike]: `%${query}%` } },
      ];
      conditions.marketplace[Op.or] = [
        { businessName: { [Op.iLike]: `%${query}%` } },
        { bio: { [Op.iLike]: `%${query}%` } },
      ];
    }

    // Category filter
    if (filters.category) {
      conditions.service.category = filters.category;
    }

    // Subcategory filter
    if (filters.subcategory) {
      conditions.service.subcategory = filters.subcategory;
    }

    return conditions;
  }

  private static buildIncludes(filters: SearchFilters) {
    const includes: any[] = [
      {
        model: Marketplace,
        as: 'marketplace',
        required: true,
      },
    ];

    // Add services include if filtering by category/price
    if (filters.category || filters.subcategory || filters.priceRange) {
      const serviceWhere: any = { isActive: true };
      
      if (filters.category) {
        serviceWhere.category = filters.category;
      }
      
      if (filters.subcategory) {
        serviceWhere.subcategory = filters.subcategory;
      }
      
      if (filters.priceRange) {
        serviceWhere.price = {
          [Op.between]: [filters.priceRange.min, filters.priceRange.max],
        };
      }

      includes.push({
        model: Service,
        as: 'services',
        where: serviceWhere,
        required: true,
      });
    }

    // Add reviews include for rating filter
    if (filters.rating) {
      includes.push({
        model: Review,
        as: 'receivedReviews',
        where: { status: 'approved' },
        required: false,
      });
    }

    return includes;
  }

  private static buildOrder(filters: SearchFilters) {
    const order: any[] = [];

    switch (filters.sortBy) {
      case 'rating':
        // Would need to calculate average rating
        order.push(['createdAt', 'DESC']);
        break;
      case 'price':
        // Would need to join with services
        order.push(['createdAt', 'DESC']);
        break;
      case 'distance':
        // Would need location calculation
        order.push(['createdAt', 'DESC']);
        break;
      case 'popularity':
        // Would need to calculate based on bookings/reviews
        order.push(['createdAt', 'DESC']);
        break;
      default:
        order.push(['createdAt', 'DESC']);
    }

    return order;
  }

  private static async enhanceProviderResults(providers: any[], filters?: SearchFilters) {
    // Add average rating, review count, distance, etc.
    const enhanced = await Promise.all(
      providers.map(async (provider) => {
        const [avgRating, reviewCount] = await Promise.all([
          this.getProviderAverageRating(provider.id),
          this.getProviderReviewCount(provider.id),
        ]);

        return {
          ...provider.toJSON(),
          averageRating: avgRating,
          totalReviews: reviewCount, // Use totalReviews to match marketplace service
          distance: (provider as any).dataValues?.distance || null,
        };
      })
    );

    return enhanced;
  }

  private static async searchServices(
    query: string,
    filters: SearchFilters,
    page: number,
    limit: number
  ) {
    const offset = (page - 1) * limit;
    const whereConditions: any = { isActive: true };

    if (query) {
      whereConditions[Op.or] = [
        { name: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
      ];
    }

    if (filters.category) {
      whereConditions.category = filters.category;
    }

    if (filters.subcategory) {
      whereConditions.subcategory = filters.subcategory;
    }

    if (filters.priceRange) {
      whereConditions.price = {
        [Op.between]: [filters.priceRange.min, filters.priceRange.max],
      };
    }

    const { count, rows: services } = await Service.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Marketplace,
          as: 'marketplace',
          required: true,
          include: [
            {
              model: User,
              as: 'user',
              where: { status: 'verified' },
              required: true,
            },
          ],
        },
      ],
      limit,
      offset,
    });

    return {
      services,
      total: count,
    };
  }

  private static async getProviderAverageRating(providerId: string): Promise<number> {
    const result = await Review.findOne({
      where: {
        providerId,
        status: 'approved',
      },
      attributes: [
        [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'average'],
      ],
      raw: true,
    }) as any;

    return parseFloat(result?.average || '0');
  }

  private static async getProviderReviewCount(providerId: string): Promise<number> {
    return await Review.count({
      where: {
        providerId,
        status: 'approved',
      },
    });
  }
}

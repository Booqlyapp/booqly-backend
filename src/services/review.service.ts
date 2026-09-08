import { Review } from '../models/review_model';
import { ReviewFlag } from '../models/review_flag_model';
import { User } from '../models/user_model';
import { Appointment } from '../models/appointment_model';
import { SubscriptionService } from './subscription.service';
import { NotificationService } from './notification.service';
import { Op } from 'sequelize';

export class ReviewService {

  private static async notifySafely(
    notificationData: Parameters<typeof NotificationService.createNotification>[0]
  ): Promise<void> {
    try {
      await NotificationService.createNotification(notificationData);
    } catch (error) {
      console.error('Failed to send review notification (non-fatal):', error);
    }
  }
  
  /**
   * Get pending review opportunities for a user (completed appointments without reviews)
   */
  static async getPendingReviewOpportunities(userId: string, userRole: 'client' | 'solo' | 'suite'): Promise<any[]> {
    try {
      let whereClause: any;
      let includeClause: any[];

      const { Marketplace } = require('../models/marketplace_model');

      if (userRole === 'client') {
        // For clients: find completed appointments where they haven't left a review
        whereClause = {
          userId: userId,
          status: 'availed', // completed appointments
        };
        includeClause = [
          {
            model: Marketplace,
            as: 'marketplace',
            attributes: ['id', 'businessName', 'userId'],
            include: [{
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'profilePic'],
            }],
          },
        ];
      } else {
        // For providers: find completed appointments where client hasn't left a review
        whereClause = {
          status: 'availed', // completed appointments
        };
        includeClause = [
          {
            model: Marketplace,
            as: 'marketplace',
            where: { userId: userId },
            attributes: ['id', 'businessName', 'userId'],
          },
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'profilePic'],
          },
        ];
      }

      // Get completed appointments
      const appointments = await Appointment.findAll({
        where: whereClause,
        include: includeClause,
        order: [['dateTime', 'DESC']],
        limit: 10, // Limit to recent appointments
      });

      // Filter out appointments that already have reviews
      const pendingReviews = [];
      for (const appointment of appointments) {
        const existingReview = await Review.findOne({
          where: {
            appointmentId: appointment.id,
            ...(userRole === 'client' 
              ? { clientId: userId }
              : { clientId: appointment.userId }
            ),
          },
        });

        if (userRole === 'client') {
          // For clients: add if no review exists and client hasn't been prompted yet
          if (!existingReview) {
            pendingReviews.push({
              appointmentId: appointment.id,
              appointmentDate: appointment.dateTime,
              appointmentPrice: appointment.price,
              providerId: (appointment as any).marketplace?.userId,
              providerName: (appointment as any).marketplace?.user?.name || (appointment as any).marketplace?.businessName,
              businessName: (appointment as any).marketplace?.businessName,
            });
          } else if (existingReview && !existingReview.clientPrompted && (!existingReview.rating || existingReview.rating === 0)) {
            // Client hasn't been prompted yet and hasn't left a review
            pendingReviews.push({
              appointmentId: appointment.id,
              appointmentDate: appointment.dateTime,
              appointmentPrice: appointment.price,
              providerId: (appointment as any).marketplace?.userId,
              providerName: (appointment as any).marketplace?.user?.name || (appointment as any).marketplace?.businessName,
              businessName: (appointment as any).marketplace?.businessName,
            });
          }
        } else {
          // For providers: add if no review exists and provider hasn't been prompted, OR if review exists but no provider response yet and not prompted
          if (!existingReview) {
            pendingReviews.push({
              appointmentId: appointment.id,
              appointmentDate: appointment.dateTime,
              appointmentPrice: appointment.price,
              clientId: appointment.userId,
              clientName: (appointment as any).user?.name,
              hasClientReview: false,
            });
          } else if (existingReview && !existingReview.providerPrompted && (!existingReview.providerResponse || existingReview.providerResponse.trim() === '')) {
            // Provider hasn't been prompted yet and hasn't left a response
            pendingReviews.push({
              appointmentId: appointment.id,
              appointmentDate: appointment.dateTime,
              appointmentPrice: appointment.price,
              clientId: appointment.userId,
              clientName: (appointment as any).user?.name,
              hasClientReview: !!existingReview.rating && existingReview.rating > 0,
            });
          }
        }
      }

      return pendingReviews;
    } catch (error) {
      console.error('Error getting pending review opportunities:', error);
      throw error;
    }
  }

  /**
   * Create a provider response without existing client review
   */
  static async createProviderResponse(responseData: {
    providerId: string;
    clientId: string;
    appointmentId: string;
    providerRating: number;
    providerResponse: string;
  }): Promise<Review> {
    try {
      // Validate provider rating
      if (responseData.providerRating < 1 || responseData.providerRating > 5) {
        throw new Error('Provider rating must be between 1 and 5');
      }

      // Check if review already exists
      const existingReview = await Review.findOne({
        where: {
          appointmentId: responseData.appointmentId,
          clientId: responseData.clientId,
        },
      });

      if (existingReview) {
        const alreadyResponded =
          existingReview.providerRating != null ||
          (existingReview.providerResponse != null &&
            existingReview.providerResponse.trim() !== '');

        if (alreadyResponded) {
          if (
            !existingReview.respondedAt ||
            Date.now() - new Date(existingReview.respondedAt).getTime() >
              ReviewService.PROVIDER_REVIEW_EDIT_WINDOW_MS
          ) {
            throw new Error(
              'Provider reviews can only be edited within 10 minutes of submission'
            );
          }

          // Keep original respondedAt so the edit window does not reset
          await existingReview.update({
            providerResponse: responseData.providerResponse,
            providerRating: responseData.providerRating,
            providerPrompted: true,
          });
        } else {
          await existingReview.update({
            providerResponse: responseData.providerResponse,
            providerRating: responseData.providerRating,
            respondedAt: new Date(),
            providerPrompted: true,
            providerPromptedAt: new Date(),
          });
        }

        await this.notifySafely({
          userId: responseData.clientId,
          type: 'review',
          title: 'Provider Response',
          content: 'A provider has left feedback for your recent appointment',
          data: {
            reviewId: existingReview.id,
            providerId: responseData.providerId,
          },
        });

        return existingReview;
      }

      // Create new review with only provider response (client fields empty)
      const review = await Review.create({
        clientId: responseData.clientId,
        providerId: responseData.providerId,
        appointmentId: responseData.appointmentId,
        rating: 0, // Placeholder - will be updated when client reviews
        comment: null, // Will be filled when client reviews
        type: 'verified',
        status: 'approved',
        isPublic: false, // Not public until client also reviews
        providerResponse: responseData.providerResponse,
        providerRating: responseData.providerRating,
        respondedAt: new Date(),
        clientPrompted: false,
        providerPrompted: true,
        clientPromptedAt: null,
        providerPromptedAt: new Date(),
      });

      await this.notifySafely({
        userId: responseData.clientId,
        type: 'review',
        title: 'Provider Response',
        content: 'A provider has left feedback for your recent appointment',
        data: {
          reviewId: review.id,
          providerId: responseData.providerId,
        },
      });

      return review;
    } catch (error) {
      console.error('Error creating provider response:', error);
      throw error;
    }
  }

  /**
   * Find existing review for appointment and client
   */
  static async findExistingReview(appointmentId: string, clientId: string): Promise<any> {
    try {
      const review = await Review.findOne({
        where: {
          appointmentId,
          clientId,
        },
      });
      return review;
    } catch (error) {
      console.error('Error finding existing review:', error);
      throw error;
    }
  }

  /**
   * Update existing review with client review data
   */
  static async updateWithClientReview(reviewId: string, clientData: {
    rating: number;
    comment?: string;
  }): Promise<Review> {
    try {
      // Validate rating
      if (clientData.rating < 1 || clientData.rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      const review = await Review.findByPk(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      // Update with client review data
      await review.update({
        rating: clientData.rating,
        comment: clientData.comment || null,
        isPublic: true, // Now public since both parties have reviewed
      });

      return review;
    } catch (error) {
      console.error('Error updating review with client data:', error);
      throw error;
    }
  }

  /**
   * Record that user was prompted and declined to review
   */
  static async recordPromptDismissal(dismissalData: {
    userId: string;
    userRole: string;
    appointmentId: string;
    clientId?: string;
    providerId?: string;
  }): Promise<void> {
    try {
      // Check if review record exists
      let existingReview = await Review.findOne({
        where: {
          appointmentId: dismissalData.appointmentId,
          clientId: dismissalData.clientId || dismissalData.userId,
        },
      });

      const updateData: any = {};
      const currentTime = new Date();

      if (dismissalData.userRole === 'client') {
        updateData.clientPrompted = true;
        updateData.clientPromptedAt = currentTime;
      } else {
        updateData.providerPrompted = true;
        updateData.providerPromptedAt = currentTime;
      }

      if (existingReview) {
        // Update existing review record
        await existingReview.update(updateData);
      } else {
        // Create new review record to track the dismissal
        await Review.create({
          clientId: dismissalData.clientId || dismissalData.userId,
          providerId: dismissalData.providerId || dismissalData.userId,
          appointmentId: dismissalData.appointmentId,
          rating: 0, // Placeholder
          comment: null,
          type: 'verified',
          status: 'approved',
          isPublic: false,
          clientPrompted: false,
          providerPrompted: false,
          clientPromptedAt: null,
          providerPromptedAt: null,
          ...updateData,
        });
      }
    } catch (error) {
      console.error('Error recording prompt dismissal:', error);
      throw error;
    }
  }

  /**
   * Review IDs that should be hidden from public listings.
   */
  static async getHiddenReviewIds(direction?: 'client_to_provider' | 'provider_to_client'): Promise<string[]> {
    try {
      const where: any = {
        status: 'approved',
      };
      if (direction) {
        where.reviewDirection = direction;
      }

      const flags = await ReviewFlag.findAll({
        where,
        attributes: ['reviewId'],
      });

      return [...new Set(flags.map((flag) => flag.reviewId))];
    } catch (error) {
      // ReviewFlags table may not exist yet if migration hasn't been run
      console.warn('Could not fetch hidden review IDs (ReviewFlags table may be missing):', error);
      return [];
    }
  }

  /**
   * Flag a review for admin moderation.
   */
  static async flagReview(
    reviewId: string,
    flaggedById: string,
    reviewDirection: 'client_to_provider' | 'provider_to_client',
    reason?: string
  ): Promise<ReviewFlag> {
    const review = await Review.findByPk(reviewId);
    if (!review) {
      throw new Error('Review not found');
    }

    if (reviewDirection === 'client_to_provider') {
      if (!review.rating || review.rating < 1) {
        throw new Error('No client review content to flag');
      }
      if (review.clientId === flaggedById) {
        throw new Error('You cannot flag your own review');
      }
    } else {
      if (!review.providerRating && !review.providerResponse) {
        throw new Error('No provider review content to flag');
      }
      if (review.providerId === flaggedById) {
        throw new Error('You cannot flag your own review');
      }
    }

    const existingFlag = await ReviewFlag.findOne({
      where: {
        reviewId,
        flaggedById,
        reviewDirection,
      },
    });

    if (existingFlag && ['pending', 'flagged', 'approved'].includes(existingFlag.status)) {
      throw new Error('You have already flagged this review');
    }

    const flag = await ReviewFlag.create({
      reviewId,
      flaggedById,
      reviewDirection,
      reason: reason?.trim() || null,
      status: 'pending',
    });

    await NotificationService.createNotification({
      userId: reviewDirection === 'client_to_provider' ? review.providerId : review.clientId,
      type: 'review',
      title: 'Review Flagged',
      content: 'A review has been flagged and is pending admin review.',
      data: { reviewId, flagId: flag.id },
    });

    return flag;
  }

  /**
   * Create a new review
   */
  static async createReview(reviewData: {
    clientId: string;
    providerId: string;
    appointmentId?: string;
    rating: number;
    comment?: string;
    type: 'verified' | 'semi_verified';
    proofDocument?: string;
  }): Promise<Review> {
    try {
      // Validate rating
      if (reviewData.rating < 1 || reviewData.rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      // Check if review already exists for this appointment
      if (reviewData.appointmentId) {
        const existingReview = await Review.findOne({
          where: {
            appointmentId: reviewData.appointmentId,
            clientId: reviewData.clientId,
          },
        });

        if (existingReview) {
          throw new Error('Review already exists for this appointment');
        }

        // Verify appointment exists and belongs to client
        const appointment = await Appointment.findOne({
          where: {
            id: reviewData.appointmentId,
            userId: reviewData.clientId,
          },
        });

        if (!appointment) {
          throw new Error('Appointment not found or does not belong to client');
        }
      }

      // Determine review status based on type
      let status: 'pending' | 'approved' | 'rejected' = 'approved';
      if (reviewData.type === 'semi_verified') {
        status = 'pending'; // Semi-verified reviews need manual approval
      }

      // Create review
      const review = await Review.create({
        clientId: reviewData.clientId,
        providerId: reviewData.providerId,
        appointmentId: reviewData.appointmentId || null,
        rating: reviewData.rating,
        comment: reviewData.comment || null,
        type: reviewData.type,
        proofDocument: reviewData.proofDocument || null,
        status,
        isPublic: true,
        clientPrompted: false,
        providerPrompted: false,
        clientPromptedAt: null,
        providerPromptedAt: null,
      });

      // Send notification to provider
      await NotificationService.createNotification({
        userId: reviewData.providerId,
        type: 'review',
        title: 'New Review Received',
        content: `You received a ${reviewData.rating}-star review`,
        data: {
          reviewId: review.id,
          rating: reviewData.rating,
        },
      });

      return review;
    } catch (error) {
      console.error('Error creating review:', error);
      throw error;
    }
  }

  /**
   * Get reviews for a provider
   */
  static async getProviderReviews(
    providerId: string,
    page: number = 1,
    limit: number = 20,
    includePrivate: boolean = false
  ) {
    try {
      const offset = (page - 1) * limit;
      const whereClause: any = {
        providerId,
        status: 'approved',
      };

      if (!includePrivate) {
        whereClause.isPublic = true;
      }

      const hiddenReviewIds = await this.getHiddenReviewIds('client_to_provider');
      if (hiddenReviewIds.length > 0) {
        whereClause.id = { [Op.notIn]: hiddenReviewIds };
      }

      const { count, rows: reviews } = await Review.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'profilePic'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      // Calculate average rating
      const avgRating = await Review.findOne({
        where: {
          providerId,
          status: 'approved',
          isPublic: true,
        },
        attributes: [
          [Review.sequelize!.fn('AVG', Review.sequelize!.col('rating')), 'averageRating'],
          [Review.sequelize!.fn('COUNT', Review.sequelize!.col('id')), 'totalReviews'],
        ],
        raw: true,
      }) as any;

      return {
        reviews,
        statistics: {
          averageRating: parseFloat(avgRating?.averageRating || '0'),
          totalReviews: parseInt(avgRating?.totalReviews || '0'),
        },
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching provider reviews:', error);
      throw error;
    }
  }

  /**
   * Get reviews by a client
   */
  static async getClientReviews(clientId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows: reviews } = await Review.findAndCountAll({
        where: { clientId },
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'profilePic'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        reviews,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching client reviews:', error);
      throw error;
    }
  }

  /**
   * Respond to a review (provider only)
   */
  static async respondToReview(
    reviewId: string,
    providerId: string,
    response: string,
    providerRating?: number
  ): Promise<Review> {
    try {
      // Check if provider has permission to respond to reviews
      const hasAccess = await SubscriptionService.hasFeatureAccess(providerId, 'reply_to_client_reviews');
      if (!hasAccess) {
        throw new Error('Review response feature requires Pro or Premium subscription');
      }

      const review = await Review.findOne({
        where: {
          id: reviewId,
          providerId,
        },
      });

      if (!review) {
        throw new Error('Review not found or access denied');
      }

      // Allow updating existing responses

      const updateData: any = {
        providerResponse: response,
        respondedAt: new Date(),
      };

      if (providerRating !== undefined) {
        updateData.providerRating = providerRating;
      }

      await review.update(updateData);

      // Send notification to client
      await NotificationService.createNotification({
        userId: review.clientId,
        type: 'review',
        title: 'Provider Responded to Your Review',
        content: 'The provider has responded to your review',
        data: {
          reviewId: review.id,
        },
      });

      return review;
    } catch (error) {
      console.error('Error responding to review:', error);
      throw error;
    }
  }

  /**
   * Update review status (admin only)
   */
  static async updateReviewStatus(
    reviewId: string,
    status: 'pending' | 'approved' | 'rejected',
    adminId: string
  ): Promise<Review> {
    try {
      const review = await Review.findByPk(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      await review.update({ status });

      // Send notification to client about status change
      let notificationContent = '';
      switch (status) {
        case 'approved':
          notificationContent = 'Your review has been approved and is now public';
          break;
        case 'rejected':
          notificationContent = 'Your review was rejected and will not be displayed';
          break;
        default:
          notificationContent = 'Your review is under review';
      }

      await NotificationService.createNotification({
        userId: review.clientId,
        type: 'review',
        title: 'Review Status Update',
        content: notificationContent,
        data: {
          reviewId: review.id,
          status,
        },
      });

      return review;
    } catch (error) {
      console.error('Error updating review status:', error);
      throw error;
    }
  }

  /**
   * Get all reviews (admin), paginated and filterable
   */
  static async getAllReviews(
    page: number = 1,
    limit: number = 20,
    filters: {
      status?: 'pending' | 'approved' | 'rejected';
      type?: 'verified' | 'semi_verified';
      rating?: number;
      providerId?: string;
      clientId?: string;
      isPublic?: boolean;
    } = {}
  ) {
    try {
      const offset = (page - 1) * limit;

      const where: any = {};
      if (filters.status) where.status = filters.status;
      if (filters.type) where.type = filters.type;
      if (filters.rating !== undefined) where.rating = filters.rating;
      if (filters.providerId) where.providerId = filters.providerId;
      if (filters.clientId) where.clientId = filters.clientId;
      if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;

      const { count, rows: reviews } = await Review.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'profilePic'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email', 'profilePic', 'businessName'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        reviews,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      console.error('Error fetching all reviews:', error);
      throw error;
    }
  }

  /**
   * Get pending reviews for moderation
   */
  static async getPendingReviews(page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows: reviews } = await Review.findAndCountAll({
        where: { status: 'pending' },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email'],
          },
        ],
        order: [['createdAt', 'ASC']],
        limit,
        offset,
      });

      return {
        reviews,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching pending reviews:', error);
      throw error;
    }
  }

  /**
   * Get review statistics for a provider
   */
  static async getProviderReviewStats(providerId: string) {
    try {
      const stats = await Review.findAll({
        where: {
          providerId,
          status: 'approved',
          isPublic: true,
        },
        attributes: [
          'rating',
          [Review.sequelize!.fn('COUNT', Review.sequelize!.col('rating')), 'count'],
        ],
        group: ['rating'],
        raw: true,
      }) as any[];

      const totalReviews = stats.reduce((sum, stat) => sum + parseInt(stat.count), 0);
      const averageRating = stats.reduce((sum, stat) => sum + (stat.rating * parseInt(stat.count)), 0) / totalReviews || 0;

      const ratingDistribution = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };

      stats.forEach(stat => {
        ratingDistribution[stat.rating as keyof typeof ratingDistribution] = parseInt(stat.count);
      });

      return {
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        ratingDistribution,
      };
    } catch (error) {
      console.error('Error fetching review stats:', error);
      throw error;
    }
  }

  /**
   * Get a review by ID
   */
  static async getReviewById(reviewId: string): Promise<Review | null> {
    try {
      const review = await Review.findByPk(reviewId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email'],
          },
        ],
      });
      return review;
    } catch (error) {
      console.error('Error fetching review by ID:', error);
      throw error;
    }
  }

  /** Clients and providers may edit reviews only within 10 minutes of submission. */
  static readonly REVIEW_EDIT_WINDOW_MS = 10 * 60 * 1000;
  static readonly CLIENT_REVIEW_EDIT_WINDOW_MS = ReviewService.REVIEW_EDIT_WINDOW_MS;
  static readonly PROVIDER_REVIEW_EDIT_WINDOW_MS = ReviewService.REVIEW_EDIT_WINDOW_MS;

  static isWithinClientReviewEditWindow(createdAt: Date | string | null | undefined): boolean {
    if (!createdAt) return false;
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(created.getTime())) return false;
    return Date.now() - created.getTime() <= ReviewService.CLIENT_REVIEW_EDIT_WINDOW_MS;
  }

  /**
   * Update a review (client can only update their own reviews within 10 minutes)
   */
  static async updateReview(reviewId: string, updateData: {
    rating?: number;
    comment?: string;
  }): Promise<Review> {
    try {
      // Validate rating if provided
      if (updateData.rating && (updateData.rating < 1 || updateData.rating > 5)) {
        throw new Error('Rating must be between 1 and 5');
      }

      const review = await Review.findByPk(reviewId);
      if (!review) {
        throw new Error('Review not found');
      }

      if (!this.isWithinClientReviewEditWindow(review.createdAt)) {
        throw new Error(
          'Reviews can only be edited within 10 minutes of submission'
        );
      }

      // Update the review (createdAt stays the same — edit window does not reset)
      await review.update(updateData);

      // Return updated review with associations
      return await Review.findByPk(reviewId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email'],
          },
        ],
      }) as Review;
    } catch (error) {
      console.error('Error updating review:', error);
      throw error;
    }
  }

  /**
   * Delete review (client or admin only)
   *
   * A client may only ever delete their own review, and can never delete a
   * provider's review/rating of them - the two live on the same row, so a
   * client-initiated delete clears only the client-owned fields and
   * preserves any providerResponse/providerRating/respondedAt. Providers
   * have no delete capability over a client's review at all (see
   * deleteProviderResponse, which only ever clears the provider's own
   * fields). Admins retain a full hard delete for moderation.
   */
  static async deleteReview(reviewId: string, userId: string, isAdmin: boolean = false): Promise<void> {
    try {
      const whereClause: any = { id: reviewId };

      if (!isAdmin) {
        whereClause.clientId = userId; // Only allow clients to delete their own reviews
      }

      const review = await Review.findOne({ where: whereClause });
      if (!review) {
        throw new Error('Review not found or access denied');
      }

      const hasProviderContent =
        review.providerResponse !== null ||
        review.providerRating !== null ||
        review.respondedAt !== null;

      if (!isAdmin && hasProviderContent) {
        // Preserve the provider's honest response/rating of this client -
        // only clear what the client themselves authored.
        await review.update({
          rating: 0,
          comment: null,
          proofDocument: null,
          isPublic: false,
        });
        return;
      }

      await review.destroy();
    } catch (error) {
      console.error('Error deleting review:', error);
      throw error;
    }
  }

  /**
   * Delete provider response (clears provider's response and rating, but keeps the client review)
   */
  static async deleteProviderResponse(reviewId: string, providerId: string): Promise<void> {
    const review = await Review.findOne({
      where: {
        id: reviewId,
        providerId: providerId,
      },
    });

    if (!review) {
      throw new Error('Review not found or access denied');
    }

    // Clear provider response and rating, but keep the client review
    await review.update({
      providerResponse: null,
      providerRating: null,
      respondedAt: null,
    });
  }

  /**
   * Check if client can leave a review for provider
   */
  static async canClientReview(clientId: string, providerId: string, appointmentId?: string): Promise<{
    canReview: boolean;
    reason?: string;
  }> {
    try {
      // Check if appointment exists and is completed
      if (appointmentId) {
        const appointment = await Appointment.findOne({
          where: {
            id: appointmentId,
            userId: clientId,
            status: 'availed', // Only completed appointments
          },
        });

        if (!appointment) {
          return {
            canReview: false,
            reason: 'Appointment not found or not completed',
          };
        }

        // Check if review already exists
        const existingReview = await Review.findOne({
          where: {
            appointmentId,
            clientId,
          },
        });

        if (existingReview) {
          return {
            canReview: false,
            reason: 'Review already exists for this appointment',
          };
        }
      }

      return { canReview: true };
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      return {
        canReview: false,
        reason: 'Error checking review eligibility',
      };
    }
  }

  /**
   * Get reviews left for a client by providers (provider ratings of the client)
   */
  static async getReviewsForClient(clientId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;
      const { Marketplace } = require('../models/marketplace_model');

      const hiddenReviewIds = await this.getHiddenReviewIds('provider_to_client');
      const reviewWhere: any = {
        clientId,
        providerRating: {
          [Op.not]: null,
        },
      };
      if (hiddenReviewIds.length > 0) {
        reviewWhere.id = { [Op.notIn]: hiddenReviewIds };
      }

      // Find reviews where the client received a provider rating
      const { count, rows: reviews } = await Review.findAndCountAll({
        where: reviewWhere,
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email', 'profilePic', 'marketplaceId'],
            include: [
              {
                model: Marketplace,
                as: 'marketplace',
                attributes: ['id', 'businessName'],
                required: false,
              },
            ],
          },
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'profilePic'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      // Fallback: marketplace may be linked via Marketplace.userId instead of User.marketplaceId
      const providerIdsNeedingName = reviews
        .filter((review) => {
          const provider = (review as any).provider;
          const name = provider?.name?.trim();
          const business = provider?.marketplace?.businessName?.trim();
          return !name && !business && !!review.providerId;
        })
        .map((review) => review.providerId);

      const marketplaceByUserId = new Map<string, string>();
      if (providerIdsNeedingName.length > 0) {
        const uniqueIds = [...new Set(providerIdsNeedingName)];
        const marketplaces = await Marketplace.findAll({
          where: { userId: { [Op.in]: uniqueIds } },
          attributes: ['userId', 'businessName'],
        });
        for (const mp of marketplaces) {
          if (mp.userId && mp.businessName) {
            marketplaceByUserId.set(mp.userId, mp.businessName);
          }
        }
      }

      // Transform the reviews to focus on provider ratings
      const providerReviews = reviews.map((review) => {
        const provider = (review as any).provider;
        const providerJson = provider?.toJSON ? provider.toJSON() : provider;
        const fallbackBusiness = marketplaceByUserId.get(review.providerId);
        const displayName =
          providerJson?.name?.trim() ||
          providerJson?.marketplace?.businessName?.trim() ||
          fallbackBusiness ||
          null;

        return {
          id: review.id,
          providerId: review.providerId,
          clientId: review.clientId,
          appointmentId: review.appointmentId,
          rating: review.providerRating,
          comment: review.providerResponse,
          createdAt: review.respondedAt || review.updatedAt,
          updatedAt: review.updatedAt,
          provider: providerJson
            ? {
                ...providerJson,
                // Ensure clients always see a usable provider/business name
                name: displayName || 'Provider',
                marketplace: providerJson.marketplace ||
                  (fallbackBusiness
                    ? { businessName: fallbackBusiness }
                    : null),
              }
            : displayName
              ? {
                  id: review.providerId,
                  name: displayName,
                  marketplace: fallbackBusiness
                    ? { businessName: fallbackBusiness }
                    : null,
                }
              : null,
          client: (review as any).client,
          isPublic: true,
        };
      });

      // Calculate statistics for all client reviews (not just paginated)
      const allClientReviews = await Review.findAll({
        where: {
          clientId,
          providerRating: {
            [Op.not]: null,
          },
        },
        attributes: ['providerRating'],
      });

      const totalReviews = allClientReviews.length;
      const averageRating = totalReviews > 0 
        ? allClientReviews.reduce((sum, review) => sum + (review.providerRating || 0), 0) / totalReviews
        : 0;

      const ratingDistribution: Record<number, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      for (const review of allClientReviews) {
        const rating = Number(review.providerRating);
        if (rating >= 1 && rating <= 5) {
          ratingDistribution[rating] += 1;
        }
      }

      return {
        reviews: providerReviews,
        statistics: {
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
          totalReviews,
          ratingDistribution,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: limit,
        },
      };
    } catch (error) {
      console.error('Error fetching reviews for client:', error);
      throw new Error('Failed to fetch reviews for client');
    }
  }

  /**
   * Get review by appointment ID
   */
  static async getReviewByAppointment(appointmentId: string, userId: string) {
    try {
      // Find review for the specific appointment
      const review = await Review.findOne({
        where: {
          appointmentId,
          [Op.or]: [
            { clientId: userId },
            { providerId: userId }
          ]
        },
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'email', 'profilePic'],
          },
          {
            model: User,
            as: 'client',
            attributes: ['id', 'name', 'email', 'profilePic'],
          },
        ],
      });

      if (!review) {
        return null;
      }

      return {
        id: review.id,
        appointmentId: review.appointmentId,
        clientId: review.clientId,
        providerId: review.providerId,
        rating: review.rating,
        comment: review.comment,
        providerResponse: review.providerResponse,
        providerRating: review.providerRating,
        respondedAt: review.respondedAt,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        provider: (review as any).provider,
        client: (review as any).client,
        status: review.status,
        isPublic: review.isPublic,
      };
    } catch (error) {
      console.error('Error fetching review by appointment:', error);
      throw new Error('Failed to fetch review by appointment');
    }
  }
}

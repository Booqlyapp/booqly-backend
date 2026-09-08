import { Op } from 'sequelize';
import { ProviderReview } from '../models/provider_review_model';
import { User } from '../models/user_model';
import { Appointment } from '../models/appointment_model';

export class ProviderReviewService {
  /**
   * Create a new provider review for a client
   */
  static async createProviderReview(data: {
    providerId: string;
    clientId: string;
    appointmentId?: string;
    rating: number;
    comment?: string;
    isPublic?: boolean;
  }) {
    try {
      const review = await ProviderReview.create({
        providerId: data.providerId,
        clientId: data.clientId,
        appointmentId: data.appointmentId || null,
        rating: data.rating,
        comment: data.comment || null,
        isPublic: data.isPublic !== false,
      });

      // Return review with client details
      const reviewWithClient = await ProviderReview.findByPk(review.id, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });

      return reviewWithClient;
    } catch (error) {
      console.error('Error creating provider review:', error);
      throw new Error('Failed to create provider review');
    }
  }

  /**
   * Get reviews left by a provider
   */
  static async getReviewsByProvider(
    providerId: string,
    page: number = 1,
    limit: number = 20
  ) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows } = await ProviderReview.findAndCountAll({
        where: { providerId },
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        reviews: rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalReviews: count,
          hasNextPage: page < Math.ceil(count / limit),
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error('Error fetching provider reviews:', error);
      throw new Error('Failed to fetch provider reviews');
    }
  }

  /**
   * Get reviews left for a client by providers
   */
  static async getReviewsForClient(
    clientId: string,
    page: number = 1,
    limit: number = 20
  ) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows } = await ProviderReview.findAndCountAll({
        where: { clientId },
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            model: Appointment,
            as: 'appointment',
            attributes: ['id', 'appointmentDate', 'status'],
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        reviews: rows,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalReviews: count,
          hasNextPage: page < Math.ceil(count / limit),
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      console.error('Error fetching client reviews:', error);
      throw new Error('Failed to fetch client reviews');
    }
  }

  /**
   * Check if provider can review a client
   */
  static async canProviderReviewClient(
    providerId: string,
    clientId: string,
    appointmentId?: string
  ) {
    try {
      // Check if there's a completed appointment between provider and client
      const appointment = await Appointment.findOne({
        where: {
          marketplaceId: providerId,
          userId: clientId, // Appointment uses userId for client
          status: 'availed', // Completed status is 'availed'
          ...(appointmentId && { id: appointmentId }),
        },
      });

      if (!appointment) {
        return {
          canReview: false,
          reason: 'No completed appointment found between provider and client',
        };
      }

      // Check if provider already reviewed this client for this appointment
      if (appointmentId) {
        const existingReview = await ProviderReview.findOne({
          where: {
            providerId,
            clientId,
            appointmentId,
          },
        });

        if (existingReview) {
          return {
            canReview: false,
            reason: 'Provider has already reviewed this client for this appointment',
          };
        }
      }

      return {
        canReview: true,
        reason: 'Provider can review this client',
      };
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      throw new Error('Failed to check review eligibility');
    }
  }

  /**
   * Update a provider review
   */
  static async updateProviderReview(
    reviewId: string,
    providerId: string,
    data: {
      rating?: number;
      comment?: string;
      isPublic?: boolean;
    }
  ) {
    try {
      const review = await ProviderReview.findOne({
        where: {
          id: reviewId,
          providerId,
        },
      });

      if (!review) {
        throw new Error('Review not found or you do not have permission to update it');
      }

      await review.update(data);

      return await ProviderReview.findByPk(reviewId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });
    } catch (error) {
      console.error('Error updating provider review:', error);
      throw error;
    }
  }

  /**
   * Delete a provider review
   */
  static async deleteProviderReview(reviewId: string, providerId: string) {
    try {
      const review = await ProviderReview.findOne({
        where: {
          id: reviewId,
          providerId,
        },
      });

      if (!review) {
        throw new Error('Review not found or you do not have permission to delete it');
      }

      await review.destroy();
      return true;
    } catch (error) {
      console.error('Error deleting provider review:', error);
      throw error;
    }
  }

  /**
   * Get provider review by ID
   */
  static async getProviderReviewById(reviewId: string) {
    try {
      return await ProviderReview.findByPk(reviewId, {
        include: [
          {
            model: User,
            as: 'client',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });
    } catch (error) {
      console.error('Error fetching provider review:', error);
      throw new Error('Failed to fetch provider review');
    }
  }
}

import { Request, Response } from 'express';
import { ReviewService } from '../services/review.service';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Get pending review opportunities for user
 */
export const getPendingReviewOpportunities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    const pendingReviews = await ReviewService.getPendingReviewOpportunities(userId, userRole);

    res.status(200).json({
      status: true,
      message: 'Pending reviews retrieved successfully',
      data: {
        pendingReviews,
        count: pendingReviews.length,
      },
    });
  } catch (error) {
    console.error('Error getting pending reviews:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to get pending reviews',
    });
  }
};

/**
 * Create provider response without existing client review
 */
export const createProviderResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    // Ensure user is a provider
    if (!['solo', 'suite'].includes(req.user.role)) {
      res.status(403).json({
        status: false,
        message: 'Only providers can create responses',
      });
      return;
    }

    const providerId = req.user.id;
    const { clientId, appointmentId, providerRating, providerResponse } = req.body;

    if (!clientId || !appointmentId || !providerRating || !providerResponse) {
      res.status(400).json({
        status: false,
        message: 'Client ID, appointment ID, rating, and response are required',
      });
      return;
    }

    const review = await ReviewService.createProviderResponse({
      providerId,
      clientId,
      appointmentId,
      providerRating,
      providerResponse,
    });

    res.status(201).json({
      status: true,
      message: 'Provider response created successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error creating provider response:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to create provider response',
    });
  }
};

/**
 * Update review with client review data
 */
export const updateWithClientReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    // Ensure user is a client
    if (req.user.role !== 'client') {
      res.status(403).json({
        status: false,
        message: 'Only clients can update reviews',
      });
      return;
    }

    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (!rating) {
      res.status(400).json({
        status: false,
        message: 'Rating is required',
      });
      return;
    }

    const review = await ReviewService.updateWithClientReview(reviewId, {
      rating,
      comment,
    });

    res.status(200).json({
      status: true,
      message: 'Review updated successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to update review',
    });
  }
};

/**
 * Record prompt dismissal when user clicks "No"
 */
export const recordPromptDismissal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { appointmentId, clientId, providerId } = req.body;
    const userRole = req.user?.role;

    if (!appointmentId) {
      res.status(400).json({
        status: false,
        message: 'Appointment ID is required',
      });
      return;
    }

    await ReviewService.recordPromptDismissal({
      userId: req.userId,
      userRole,
      appointmentId,
      clientId,
      providerId,
    });

    res.status(200).json({
      status: true,
      message: 'Prompt dismissal recorded successfully',
    });
  } catch (error) {
    console.error('Error recording prompt dismissal:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to record prompt dismissal',
    });
  }
};

/**
 * Create a new review or update existing one
 */
export const createReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const clientId = req.user.id;
    const { providerId, appointmentId, rating, comment, type = 'verified', proofDocument } = req.body;

    if (!providerId || !rating) {
      res.status(400).json({
        status: false,
        message: 'Provider ID and rating are required',
      });
      return;
    }

    // Check if review already exists for this appointment
    let existingReview = null;
    if (appointmentId) {
      existingReview = await ReviewService.findExistingReview(appointmentId, clientId);
    }

    let review;
    if (existingReview) {
      // Update existing review with client data
      review = await ReviewService.updateWithClientReview(existingReview.id, {
        rating,
        comment,
      });
    } else {
      // Create new review
      review = await ReviewService.createReview({
        clientId,
        providerId,
        appointmentId,
        rating,
        comment,
        type,
        proofDocument,
      });
    }

    res.status(201).json({
      status: true,
      message: existingReview ? 'Review updated successfully' : 'Review created successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Update a review (client can only update their own reviews)
 */
export const updateReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const clientId = req.user.id;
    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (!rating && !comment) {
      res.status(400).json({
        status: false,
        message: 'At least rating or comment is required for update',
      });
      return;
    }

    // Check if the review exists and belongs to the authenticated user
    const existingReview = await ReviewService.getReviewById(reviewId);
    if (!existingReview) {
      res.status(404).json({
        status: false,
        message: 'Review not found',
      });
      return;
    }

    // Verify ownership - user can only update their own reviews
    if (existingReview.clientId !== clientId) {
      res.status(403).json({
        status: false,
        message: 'You can only update your own reviews',
      });
      return;
    }

    if (!ReviewService.isWithinClientReviewEditWindow(existingReview.createdAt)) {
      res.status(403).json({
        status: false,
        message: 'Reviews can only be edited within 10 minutes of submission',
      });
      return;
    }

    const updatedReview = await ReviewService.updateReview(reviewId, {
      rating,
      comment,
    });

    res.status(200).json({
      status: true,
      message: 'Review updated successfully',
      data: updatedReview,
    });
  } catch (error) {
    console.error('Error updating review:', error);
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    const isEditWindowError = message.includes('minutes of submission');
    res.status(isEditWindowError ? 403 : 500).json({
      status: false,
      message: isEditWindowError ? message : 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: message,
      }),
    });
  }
};

/**
 * Get reviews for a provider
 */
export const getProviderReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerId } = req.params;
    const { page = 1, limit = 20, includePrivate = false } = req.query;

    const result = await ReviewService.getProviderReviews(
      providerId,
      parseInt(page as string),
      parseInt(limit as string),
      includePrivate === 'true'
    );

    res.status(200).json({
      status: true,
      message: 'Provider reviews retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching provider reviews:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch provider reviews',
    });
  }
};

/**
 * Get reviews by a client
 */
export const getClientReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const clientId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await ReviewService.getClientReviews(
      clientId,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Client reviews retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching client reviews:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch client reviews',
    });
  }
};

/**
 * Respond to a review (provider only)
 */
export const respondToReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const providerId = req.user.id;
    const { reviewId } = req.params;
    const { response, providerRating } = req.body;

    if (!response) {
      res.status(400).json({
        status: false,
        message: 'Response content is required',
      });
      return;
    }

    // Validate provider rating if provided
    if (providerRating !== undefined && (providerRating < 1 || providerRating > 5)) {
      res.status(400).json({
        status: false,
        message: 'Provider rating must be between 1 and 5',
      });
      return;
    }

    const review = await ReviewService.respondToReview(reviewId, providerId, response, providerRating);

    res.status(200).json({
      status: true,
      message: 'Review response added successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error responding to review:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to respond to review',
    });
  }
};

/**
 * Get provider review statistics
 */
export const getProviderReviewStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerId } = req.params;

    const stats = await ReviewService.getProviderReviewStats(providerId);

    res.status(200).json({
      status: true,
      message: 'Review statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch review statistics',
    });
  }
};

/**
 * Update review status (admin only)
 */
export const updateReviewStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    // TODO: Add admin role check
    // if (req.user.role !== 'admin') {
    //   res.status(403).json({
    //     status: false,
    //     message: 'Admin access required',
    //   });
    //   return;
    // }

    const { reviewId } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      res.status(400).json({
        status: false,
        message: 'Invalid status. Must be pending, approved, or rejected',
      });
      return;
    }

    const review = await ReviewService.updateReviewStatus(reviewId, status, req.user.id);

    res.status(200).json({
      status: true,
      message: 'Review status updated successfully',
      data: review,
    });
  } catch (error) {
    console.error('Error updating review status:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to update review status',
    });
  }
};

/**
 * Get all reviews (admin only), paginated and filterable
 */
export const getAllReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      rating,
      providerId,
      clientId,
      isPublic,
    } = req.query;

    const result = await ReviewService.getAllReviews(
      parseInt(page as string) || 1,
      Math.min(parseInt(limit as string) || 20, 100),
      {
        status: status as 'pending' | 'approved' | 'rejected' | undefined,
        type: type as 'verified' | 'semi_verified' | undefined,
        rating: rating !== undefined ? parseInt(rating as string) : undefined,
        providerId: providerId as string | undefined,
        clientId: clientId as string | undefined,
        isPublic: isPublic !== undefined ? isPublic === 'true' : undefined,
      }
    );

    res.status(200).json({
      status: true,
      message: 'Reviews retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching all reviews:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch reviews',
    });
  }
};

/**
 * Get pending reviews for moderation (admin only)
 */
export const getPendingReviews = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    // TODO: Add admin role check
    // if (req.user.role !== 'admin') {
    //   res.status(403).json({
    //     status: false,
    //     message: 'Admin access required',
    //   });
    //   return;
    // }

    const { page = 1, limit = 20 } = req.query;

    const result = await ReviewService.getPendingReviews(
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Pending reviews retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch pending reviews',
    });
  }
};

/**
 * Delete review
 */
export const deleteReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { reviewId } = req.params;
    const isAdmin = req.user.role === 'admin';

    await ReviewService.deleteReview(reviewId, req.user.id, isAdmin);

    res.status(200).json({
      status: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to delete review',
    });
  }
};

/**
 * Create a provider review for a client
 */
export const createProviderReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const providerId = req.user.id;
    const { clientId, appointmentId, rating, comment, isPublic = true } = req.body;

    if (!clientId || !rating) {
      res.status(400).json({
        status: false,
        message: 'Client ID and rating are required',
      });
      return;
    }

    // TODO: Implement provider review functionality
    res.status(501).json({
      status: false,
      message: 'Provider review functionality not yet implemented',
    });
    return;
  } catch (error) {
    console.error('Error creating provider review:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Get reviews left by a provider
 */
export const getReviewsByProvider = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const providerId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    // TODO: Implement get reviews by provider functionality
    res.status(501).json({
      status: false,
      message: 'Get reviews by provider functionality not yet implemented',
    });
  } catch (error) {
    console.error('Error fetching provider reviews:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch provider reviews',
    });
  }
};

/**
 * Get reviews left for a client by providers
 */
export const getReviewsForClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await ReviewService.getReviewsForClient(req.user.id, page, limit);
    
    res.status(200).json({
      status: true,
      message: 'Reviews for client fetched successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching reviews for client:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch reviews for client',
    });
  }
};

/**
 * Get reviews for a specific client (providers viewing a client profile)
 */
export const getReviewsForClientById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    if (req.user.role !== 'solo' && req.user.role !== 'suite') {
      res.status(403).json({
        status: false,
        message: 'Access denied. Only professionals can view client reviews.',
      });
      return;
    }

    const { clientId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await ReviewService.getReviewsForClient(clientId, page, limit);

    res.status(200).json({
      status: true,
      message: 'Client reviews fetched successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching client reviews by id:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch client reviews',
    });
  }
};

/**
 * Delete provider review
 */
export const deleteProviderReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { reviewId } = req.params;
    const providerId = req.user.id;

    await ReviewService.deleteProviderResponse(reviewId, providerId);

    res.status(200).json({
      status: true,
      message: 'Provider response deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting provider review:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to delete provider response',
    });
  }
};

// NOTE: providers must never be able to delete a client's review of them -
// see deleteProviderReview above, which only clears the provider's own
// response/rating and leaves the client's review intact.

/**
 * Flag a review for admin moderation
 */
export const flagReview = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { reviewId } = req.params;
    const { reason, reviewDirection } = req.body;

    if (!reviewDirection || !['client_to_provider', 'provider_to_client'].includes(reviewDirection)) {
      res.status(400).json({
        status: false,
        message: 'reviewDirection must be client_to_provider or provider_to_client',
      });
      return;
    }

    const flag = await ReviewService.flagReview(
      reviewId,
      req.user.id,
      reviewDirection,
      reason
    );

    res.status(201).json({
      status: true,
      message: 'Review flagged successfully. Our team will review it shortly.',
      data: flag,
    });
  } catch (error) {
    console.error('Error flagging review:', error);
    const message = error instanceof Error ? error.message : 'Failed to flag review';
    const isClientError =
      message.includes('not found') ||
      message.includes('cannot flag') ||
      message.includes('already flagged') ||
      message.includes('No ');
    res.status(isClientError ? 400 : 500).json({
      status: false,
      message,
    });
  }
};

/**
 * Get review by appointment ID
 */
export const getReviewByAppointment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { appointmentId } = req.params;
    const userId = req.user.id;

    const result = await ReviewService.getReviewByAppointment(appointmentId, userId);
    
    res.status(200).json({
      status: true,
      message: 'Review fetched successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching review by appointment:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch review',
    });
  }
};

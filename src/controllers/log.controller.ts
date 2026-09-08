import { Request, Response } from 'express';
import { Log } from '../models/log_model';
import { Op, fn, col } from 'sequelize';

// Get logs with filtering and pagination
export const getLogs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const {
      level,
      module,
      action,
      userId,
      method,
      statusCode,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    // Build where clause
    const whereClause: any = {};

    if (level) {
      if (typeof level === 'string' && level.includes(',')) {
        const levels = level.split(',').map(l => parseInt(l.trim())).filter(l => !isNaN(l));
        whereClause.level = { [Op.in]: levels };
      } else {
        whereClause.level = parseInt(level as string);
      }
    }

    if (module) {
      whereClause.module = module;
    }

    if (action) {
      whereClause.action = action;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    if (method) {
      whereClause.method = method;
    }

    if (statusCode) {
      if (typeof statusCode === 'string' && statusCode.includes(',')) {
        const codes = statusCode.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c));
        whereClause.statusCode = { [Op.in]: codes };
      } else {
        whereClause.statusCode = parseInt(statusCode as string);
      }
    }

    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate as string);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate as string);
      }
    }

    if (search) {
      whereClause[Op.or] = [
        { msg: { [Op.iLike]: `%${search}%` } },
        { url: { [Op.iLike]: `%${search}%` } },
        { ip: { [Op.iLike]: `%${search}%` } },
        { userAgent: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 50, 1000); // Max 1000 logs per request
    const offset = (pageNum - 1) * limitNum;

    // Valid sort fields
    const validSortFields = ['createdAt', 'level', 'time', 'statusCode', 'responseTime', 'module', 'action'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'createdAt';
    const order = (sortOrder as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Execute query
    const { count, rows: logs } = await Log.findAndCountAll({
      where: whereClause,
      order: [[sortField, order]],
      limit: limitNum,
      offset,
      attributes: [
        'id', 'level', 'levelName', 'time', 'reqId', 'userId', 'method', 'url', 
        'statusCode', 'responseTime', 'ip', 'msg', 'module', 'action', 
        'metadata', 'error', 'createdAt'
      ]
    });

    // Calculate pagination info
    const totalPages = Math.ceil(count / limitNum);

    return res.status(200).json({
      status: true,
      message: `Found ${logs.length} logs`,
      data: {
        logs,
        pagination: {
          total: count,
          page: pageNum,
          limit: limitNum,
          pages: totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching logs:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch logs',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// Get log statistics
export const getLogStats = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt[Op.gte] = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.createdAt[Op.lte] = new Date(endDate as string);
      }
    }

    // Get log level distribution
    const levelStats = await Log.findAll({
      where: dateFilter,
      attributes: [
        'levelName',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['levelName'],
      raw: true
    });

    // Get module distribution
    const moduleStats = await Log.findAll({
      where: {
        ...dateFilter,
        module: { [Op.ne]: null }
      },
      attributes: [
        'module',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['module'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      limit: 10,
      raw: true
    });

    // Get HTTP status code distribution
    const statusStats = await Log.findAll({
      where: {
        ...dateFilter,
        statusCode: { [Op.ne]: null }
      },
      attributes: [
        'statusCode',
        [fn('COUNT', col('id')), 'count']
      ],
      group: ['statusCode'],
      order: [[fn('COUNT', col('id')), 'DESC']],
      raw: true
    });

    // Get error count (level >= 50)
    const errorCount = await Log.count({
      where: {
        ...dateFilter,
        level: { [Op.gte]: 50 }
      }
    });

    // Get total logs count
    const totalCount = await Log.count({
      where: dateFilter
    });

    return res.status(200).json({
      status: true,
      message: 'Log statistics retrieved successfully',
      data: {
        summary: {
          total: totalCount,
          errors: errorCount,
          errorRate: totalCount > 0 ? ((errorCount / totalCount) * 100).toFixed(2) : '0.00'
        },
        levelDistribution: levelStats,
        moduleDistribution: moduleStats,
        statusCodeDistribution: statusStats
      }
    });

  } catch (error) {
    console.error('Error fetching log stats:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch log statistics',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// Get recent errors
export const getRecentErrors = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    const errors = await Log.findAll({
      where: {
        level: { [Op.gte]: 50 } // Error and Fatal levels
      },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      attributes: [
        'id', 'level', 'levelName', 'time', 'reqId', 'userId', 'method', 'url',
        'statusCode', 'ip', 'msg', 'module', 'action', 'error', 'createdAt'
      ]
    });

    return res.status(200).json({
      status: true,
      message: `Found ${errors.length} recent errors`,
      data: {
        errors
      }
    });

  } catch (error) {
    console.error('Error fetching recent errors:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch recent errors',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

// Delete old logs (cleanup)
export const cleanupLogs = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { days = 30 } = req.query;
    const daysNum = parseInt(days as string) || 30;
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    // Delete old logs
    const deletedCount = await Log.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate
        }
      }
    });

    return res.status(200).json({
      status: true,
      message: `Deleted ${deletedCount} logs older than ${daysNum} days`,
      data: {
        deletedCount,
        cutoffDate: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Error cleaning up logs:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to cleanup logs',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
};

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Pino log level: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal',
      },
      levelName: {
        type: Sequelize.STRING(10),
        allowNull: false,
        comment: 'Human readable log level name',
      },
      time: {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: 'Unix timestamp in milliseconds',
      },
      pid: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Process ID',
      },
      hostname: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Server hostname',
      },
      reqId: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Request ID for correlation',
        index: true,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID if available',
        index: true,
      },
      method: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'HTTP method for request logs',
      },
      url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Request URL',
      },
      statusCode: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'HTTP status code',
        index: true,
      },
      responseTime: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Response time in milliseconds',
      },
      userAgent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User agent string',
      },
      ip: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'Client IP address',
        index: true,
      },
      msg: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Log message',
      },
      module: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Module/controller name',
        index: true,
      },
      action: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Action/function name',
        index: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Additional structured data',
      },
      error: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Error details if applicable',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('Logs', ['level']);
    await queryInterface.addIndex('Logs', ['time']);
    await queryInterface.addIndex('Logs', ['createdAt']);
    await queryInterface.addIndex('Logs', ['module', 'action']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Logs');
  }
};

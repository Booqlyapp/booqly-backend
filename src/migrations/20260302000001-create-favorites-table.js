'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('favorites', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      marketplaceId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Marketplaces',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    // Add unique constraint to prevent duplicate favorites
    await queryInterface.addIndex('favorites', ['userId', 'marketplaceId'], {
      unique: true,
      name: 'favorites_user_marketplace_unique',
    });

    // Add individual indexes for performance
    await queryInterface.addIndex('favorites', ['userId'], {
      name: 'favorites_userId_index',
    });

    await queryInterface.addIndex('favorites', ['marketplaceId'], {
      name: 'favorites_marketplaceId_index',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('favorites');
  },
};

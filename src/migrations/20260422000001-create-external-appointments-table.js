'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ExternalAppointments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      marketplaceId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Marketplaces',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      servicesData: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Array of {serviceId, serviceName, price, addOns: [{id, title, price}]}',
      },
      firstName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      lastName: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      dateTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'confirmed', 'canceled', 'completed', 'no_show'),
        allowNull: false,
        defaultValue: 'pending',
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      depositAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      remainingBalance: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      depositPaid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stripePaymentIntentId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      stripeChargeId: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      depositPaidAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      acceptedTerms: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      marketingConsent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('ExternalAppointments', ['marketplaceId']);
    await queryInterface.addIndex('ExternalAppointments', ['email']);
    await queryInterface.addIndex('ExternalAppointments', ['dateTime']);
    await queryInterface.addIndex('ExternalAppointments', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ExternalAppointments');
  },
};

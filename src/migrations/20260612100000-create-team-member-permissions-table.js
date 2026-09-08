"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("TeamMemberPermissions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      teamMemberId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      ownerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      viewBookings: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageTeamMembers: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      useChat: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewReviewCenter: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewPromotions: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewAnalytics: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewMarketplace: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageSubscription: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageSocialLinks: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewReviews: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageRedeemCodes: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex("TeamMemberPermissions", ["teamMemberId", "ownerId"], {
      unique: true,
      name: "team_member_permissions_member_owner_unique",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("TeamMemberPermissions");
  },
};

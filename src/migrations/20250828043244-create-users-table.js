"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Users",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          role: {
            type: Sequelize.ENUM('client', 'solo', 'suite'),
            allowNull: false,
          },
          email: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          password: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          phone: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          businessName: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          profilePic: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          marketplaceId: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          stripeCustomerId: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          currentSubscriptionId: {
            type: Sequelize.UUID,
            allowNull: true,
          },
          referralCode: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
          },
          referredBy: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          freeBookingUsed: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          // Social media fields for clients (providers use Social model via marketplace)
          insta: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          tiktok: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          facebook: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM('pending', 'verified', 'rejected'),
            allowNull: true,
            defaultValue: 'pending',
          },
          accountVerified: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          identityDocumentUrl: {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Government-issued ID document URL (optional at signup, required before booking or chat)',
          },
          fcmToken: {
            type: Sequelize.STRING,
            allowNull: true,
          },
             isTeamMember: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          teamOwnerId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          jobTitle: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          employmentStartDate: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          employmentEndDate: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          deletedAt: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
          },
        },
        { transaction }
      );
       await queryInterface.addIndex("Users", ["teamOwnerId"], {
        name: "users_team_owner_id_idx",
        transaction,
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Users", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

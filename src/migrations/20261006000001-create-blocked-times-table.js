"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("BlockedTimes", {
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
          model: "Marketplaces",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      createdByUserId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      assignedTeamMemberId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      blockType: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      customBlockType: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      startDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      endDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      frequency: {
        type: Sequelize.ENUM("one_time", "daily"),
        allowNull: false,
        defaultValue: "one_time",
      },
      comments: {
        type: Sequelize.TEXT,
        allowNull: true,
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
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("BlockedTimes", ["marketplaceId"], {
      name: "blocked_times_marketplace_id_idx",
    });
    await queryInterface.addIndex("BlockedTimes", ["startDateTime", "endDateTime"], {
      name: "blocked_times_range_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("BlockedTimes", "blocked_times_range_idx");
    await queryInterface.removeIndex(
      "BlockedTimes",
      "blocked_times_marketplace_id_idx"
    );
    await queryInterface.dropTable("BlockedTimes");
  },
};

"use strict";

/** Client Instagram-style portfolio save collections */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "PortfolioCollections",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          ownerUserId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          name: {
            type: Sequelize.STRING(40),
            allowNull: false,
          },
          coverImageUrl: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          isPrivate: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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
        },
        { transaction }
      );

      await queryInterface.createTable(
        "PortfolioCollectionItems",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          collectionId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "PortfolioCollections", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          ownerUserId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          itemType: {
            type: Sequelize.ENUM("portfolio_image", "reel"),
            allowNull: false,
          },
          imageUrl: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          marketplaceId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "Marketplaces", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          videoId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "Videos", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
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
        },
        { transaction }
      );

      await queryInterface.createTable(
        "PortfolioCollectionMembers",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          collectionId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "PortfolioCollections", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
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
        },
        { transaction }
      );

      await queryInterface.addIndex(
        "PortfolioCollections",
        ["ownerUserId"],
        { transaction }
      );
      await queryInterface.addIndex(
        "PortfolioCollections",
        ["ownerUserId", "name"],
        {
          unique: true,
          name: "pc_owner_name_unique",
          transaction,
        }
      );
      await queryInterface.addIndex(
        "PortfolioCollectionItems",
        ["collectionId"],
        { transaction }
      );
      await queryInterface.addIndex(
        "PortfolioCollectionItems",
        ["ownerUserId", "itemType", "imageUrl"],
        { name: "pci_owner_image_idx", transaction }
      );
      await queryInterface.addIndex(
        "PortfolioCollectionItems",
        ["ownerUserId", "itemType", "videoId"],
        { name: "pci_owner_video_idx", transaction }
      );
      await queryInterface.addIndex(
        "PortfolioCollectionMembers",
        ["collectionId", "userId"],
        { unique: true, name: "pcm_collection_user_unique", transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("PortfolioCollectionMembers", {
        transaction,
      });
      await queryInterface.dropTable("PortfolioCollectionItems", {
        transaction,
      });
      await queryInterface.dropTable("PortfolioCollections", { transaction });
      // ENUM cleanup (Postgres)
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_PortfolioCollectionItems_itemType";',
        { transaction }
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};

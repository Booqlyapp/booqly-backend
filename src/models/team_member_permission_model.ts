import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface TeamMemberPermissionAttributes {
  id: string;
  teamMemberId: string;
  ownerId: string;
  /** @deprecated Prefer viewTotalBookings / viewLimitedBookings */
  viewBookings: boolean;
  viewTotalBookings: boolean;
  viewLimitedBookings: boolean;
  viewTotalEarnings: boolean;
  viewLimitedEarnings: boolean;
  manageTeamMembers: boolean;
  useChat: boolean;
  viewReviewCenter: boolean;
  viewPromotions: boolean;
  viewAnalytics: boolean;
  viewMarketplace: boolean;
  manageSubscription: boolean;
  manageSocialLinks: boolean;
  viewReviews: boolean;
  manageRedeemCodes: boolean;
  manageServices: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class TeamMemberPermission
  extends Model<InferAttributes<TeamMemberPermission>, InferCreationAttributes<TeamMemberPermission>>
  implements TeamMemberPermissionAttributes
{
  declare id: CreationOptional<string>;
  declare teamMemberId: string;
  declare ownerId: string;
  declare viewBookings: CreationOptional<boolean>;
  declare viewTotalBookings: CreationOptional<boolean>;
  declare viewLimitedBookings: CreationOptional<boolean>;
  declare viewTotalEarnings: CreationOptional<boolean>;
  declare viewLimitedEarnings: CreationOptional<boolean>;
  declare manageTeamMembers: CreationOptional<boolean>;
  declare useChat: CreationOptional<boolean>;
  declare viewReviewCenter: CreationOptional<boolean>;
  declare viewPromotions: CreationOptional<boolean>;
  declare viewAnalytics: CreationOptional<boolean>;
  declare viewMarketplace: CreationOptional<boolean>;
  declare manageSubscription: CreationOptional<boolean>;
  declare manageSocialLinks: CreationOptional<boolean>;
  declare viewReviews: CreationOptional<boolean>;
  declare manageRedeemCodes: CreationOptional<boolean>;
  declare manageServices: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initTeamMemberPermission(sequelize: Sequelize) {
  console.log("Initializing TeamMemberPermission model");
  TeamMemberPermission.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      teamMemberId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      viewBookings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewTotalBookings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewLimitedBookings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewTotalEarnings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewLimitedEarnings: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageTeamMembers: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      useChat: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewReviewCenter: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewPromotions: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewAnalytics: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewMarketplace: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageSubscription: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageSocialLinks: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      viewReviews: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageRedeemCodes: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      manageServices: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "TeamMemberPermission",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["teamMemberId", "ownerId"],
          name: "team_member_permissions_member_owner_unique",
        },
      ],
    }
  );

  return TeamMemberPermission;
}

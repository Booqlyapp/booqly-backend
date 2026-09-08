import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';


interface FavoriteAttributes {
  id: string;
  userId: string;
  marketplaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FavoriteCreationAttributes extends Optional<FavoriteAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

class Favorite extends Model<FavoriteAttributes, FavoriteCreationAttributes> implements FavoriteAttributes {
  public id!: string;
  public userId!: string;
  public marketplaceId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Favorite.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    marketplaceId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'marketplaces',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
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
    tableName: 'favorites',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['userId', 'marketplaceId'],
      },
      {
        fields: ['userId'],
      },
      {
        fields: ['marketplaceId'],
      },
    ],
  }
);

export default Favorite;

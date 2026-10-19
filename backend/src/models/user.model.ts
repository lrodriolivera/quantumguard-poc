/**
 * User Model
 * Sequelize TypeScript model for users table
 */

import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  Unique,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Document } from './document.model';

@Table({
  tableName: 'users',
  timestamps: true,
  underscored: true,
})
export class User extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(255))
  email!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  password_hash!: string;

  @Column(DataType.STRING(100))
  first_name?: string;

  @Column(DataType.STRING(100))
  last_name?: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  is_active!: boolean;

  @Default('free')
  @Column(DataType.STRING(20))
  plan!: string;

  @Column(DataType.STRING(100))
  stripe_customer_id?: string;

  @Column(DataType.STRING(100))
  stripe_subscription_id?: string;

  @Column(DataType.STRING(30))
  stripe_subscription_status?: string;

  @Column(DataType.DATE)
  plan_renews_at?: Date;

  @CreatedAt
  @Column(DataType.DATE)
  created_at!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @HasMany(() => Document)
  documents?: Document[];

  /**
   * Get user's full name
   */
  get fullName(): string {
    if (this.first_name && this.last_name) {
      return `${this.first_name} ${this.last_name}`;
    }
    return this.email;
  }

  /**
   * Return user data without sensitive fields
   */
  toSafeJSON() {
    return {
      id: this.id,
      email: this.email,
      first_name: this.first_name,
      last_name: this.last_name,
      is_active: this.is_active,
      plan: this.plan,
      plan_renews_at: this.plan_renews_at,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

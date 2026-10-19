/**
 * Envelope Model
 * A document routed to one or more signers (the owner and/or external
 * people without a QuantumGuard account).
 */

import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Document } from './document.model';
import { User } from './user.model';
import { EnvelopeSigner } from './envelope-signer.model';

export type EnvelopeMode = 'parallel' | 'sequential';
export type EnvelopeStatus = 'draft' | 'sent' | 'completed' | 'voided';

@Table({
  tableName: 'envelopes',
  timestamps: true,
  underscored: true,
})
export class Envelope extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Document)
  @AllowNull(false)
  @Column(DataType.UUID)
  document_id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  owner_user_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(2))
  country!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  algorithm!: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  hybrid!: boolean;

  @Default('parallel')
  @Column(DataType.STRING(20))
  mode!: EnvelopeMode;

  @Default('draft')
  @Column(DataType.STRING(20))
  status!: EnvelopeStatus;

  @Column(DataType.DATE)
  completed_at?: Date;

  @CreatedAt
  @Column(DataType.DATE)
  created_at!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updated_at!: Date;

  @BelongsTo(() => Document)
  document?: Document;

  @BelongsTo(() => User)
  owner?: User;

  @HasMany(() => EnvelopeSigner)
  signers?: EnvelopeSigner[];

  toSafeJSON() {
    return {
      id: this.id,
      document_id: this.document_id,
      owner_user_id: this.owner_user_id,
      country: this.country,
      algorithm: this.algorithm,
      hybrid: this.hybrid,
      mode: this.mode,
      status: this.status,
      completed_at: this.completed_at ?? null,
      created_at: this.created_at,
      updated_at: this.updated_at,
      signers: this.signers?.map((s) => s.toOwnerJSON()),
    };
  }
}

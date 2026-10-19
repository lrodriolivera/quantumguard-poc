/**
 * EnvelopeSigner Model
 * One person invited to sign an envelope's document. Identified by a
 * single-use access token (hashed, like a password — never stored or
 * logged in plain text) instead of a QuantumGuard account.
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
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { Envelope } from './envelope.model';
import { Signature } from './signature.model';

export type EnvelopeSignerStatus =
  | 'pending'
  | 'notified'
  | 'viewed'
  | 'otp_verified'
  | 'signed'
  | 'declined';

@Table({
  tableName: 'envelope_signers',
  timestamps: true,
  underscored: true,
})
export class EnvelopeSigner extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Envelope)
  @AllowNull(false)
  @Column(DataType.UUID)
  envelope_id!: string;

  @ForeignKey(() => Signature)
  @Column(DataType.UUID)
  signature_id?: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  email!: string;

  @Column(DataType.STRING(30))
  phone?: string;

  @Default(1)
  @Column(DataType.INTEGER)
  order_index!: number;

  @Default('pending')
  @Column(DataType.STRING(20))
  status!: EnvelopeSignerStatus;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  access_token_hash!: string;

  @AllowNull(false)
  @Column(DataType.DATE)
  access_token_expires_at!: Date;

  @Column(DataType.STRING(64))
  otp_code_hash?: string;

  @Column(DataType.DATE)
  otp_sent_at?: Date;

  @Column(DataType.DATE)
  otp_expires_at?: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  otp_attempts!: number;

  @Column(DataType.DATE)
  otp_verified_at?: Date;

  @Column(DataType.DATE)
  notified_at?: Date;

  @Column(DataType.DATE)
  declined_at?: Date;

  @Column(DataType.TEXT)
  decline_reason?: string;

  @Column(DataType.DATE)
  signed_at?: Date;

  @Column(DataType.STRING(64))
  verified_ip?: string;

  @Column(DataType.STRING(500))
  verified_user_agent?: string;

  @CreatedAt
  @Column(DataType.DATE)
  created_at!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updated_at!: Date;

  @BelongsTo(() => Envelope)
  envelope?: Envelope;

  @BelongsTo(() => Signature)
  signature?: Signature;

  get isAccessTokenExpired(): boolean {
    return new Date() > this.access_token_expires_at;
  }

  get isOtpVerifiedRecently(): boolean {
    if (!this.otp_verified_at) return false;
    const validWindowMs = 15 * 60 * 1000;
    return Date.now() - this.otp_verified_at.getTime() < validWindowMs;
  }

  /** For the envelope owner: tracking status of every invited signer. */
  toOwnerJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone ?? null,
      order_index: this.order_index,
      status: this.status,
      signature_id: this.signature_id ?? null,
      notified_at: this.notified_at ?? null,
      signed_at: this.signed_at ?? null,
      declined_at: this.declined_at ?? null,
      decline_reason: this.decline_reason ?? null,
    };
  }

  /** For the signer themselves, via their token: no other signer's data. */
  toPublicJSON() {
    return {
      name: this.name,
      email: this.email,
      order_index: this.order_index,
      status: this.status,
    };
  }
}

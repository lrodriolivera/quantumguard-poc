/**
 * Signature Model
 * Sequelize TypeScript model for signatures table
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
} from 'sequelize-typescript';
import { Document } from './document.model';

@Table({
  tableName: 'signatures',
  timestamps: false,
  underscored: true,
})
export class Signature extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => Document)
  @AllowNull(false)
  @Column(DataType.UUID)
  document_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  algorithm!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  public_key!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  signature_data!: string;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  document_hash!: string;

  @Column(DataType.DATE)
  timestamp!: Date;

  @Column(DataType.DATE)
  valid_until?: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  quantum_safe!: boolean;

  @Column(DataType.INTEGER)
  signature_size?: number;

  @Column(DataType.TEXT)
  signer_cert?: string;

  @Column(DataType.TEXT)
  cms_signature?: string;

  @CreatedAt
  @Column(DataType.DATE)
  created_at!: Date;

  // Associations
  @BelongsTo(() => Document)
  document?: Document;

  /**
   * Check if signature is still valid
   */
  get isValid(): boolean {
    if (!this.valid_until) return true;
    return new Date() < this.valid_until;
  }

  /**
   * Get algorithm display name
   */
  get algorithmDisplay(): string {
    const names: { [key: string]: string } = {
      'Dilithium2': 'ML-DSA-44 (NIST Level 2)',
      'Dilithium3': 'ML-DSA-65 (NIST Level 3)',
      'Dilithium5': 'ML-DSA-87 (NIST Level 5)',
      'ML-DSA-44': 'ML-DSA-44 (NIST Level 2)',
      'ML-DSA-65': 'ML-DSA-65 (NIST Level 3)',
      'ML-DSA-87': 'ML-DSA-87 (NIST Level 5)',
      'SLH-DSA-SHA2-128s': 'SLH-DSA-SHA2-128s (NIST Level 1)',
      'SLH-DSA-SHA2-192s': 'SLH-DSA-SHA2-192s (NIST Level 3)',
      'SLH-DSA-SHA2-256s': 'SLH-DSA-SHA2-256s (NIST Level 5)',
    };
    return names[this.algorithm] || this.algorithm;
  }

  /**
   * Get signature size in human-readable format
   */
  get signatureSizeFormatted(): string {
    if (!this.signature_size) return 'Unknown';
    const bytes = this.signature_size;
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(2) + ' KB';
  }

  /**
   * Return safe signature data
   */
  toSafeJSON() {
    return {
      id: this.id,
      document_id: this.document_id,
      algorithm: this.algorithm,
      algorithm_display: this.algorithmDisplay,
      public_key: this.public_key,
      signature_data: this.signature_data,
      document_hash: this.document_hash,
      timestamp: this.timestamp,
      valid_until: this.valid_until,
      is_valid: this.isValid,
      quantum_safe: this.quantum_safe,
      signature_size: this.signature_size,
      signature_size_formatted: this.signatureSizeFormatted,
      created_at: this.created_at,
    };
  }
}

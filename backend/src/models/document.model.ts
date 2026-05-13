/**
 * Document Model
 * Sequelize TypeScript model for documents table
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
import { User } from './user.model';
import { Signature } from './signature.model';

@Table({
  tableName: 'documents',
  timestamps: true,
  underscored: true,
})
export class Document extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.UUID)
  user_id!: string;

  @AllowNull(false)
  @Column(DataType.STRING(500))
  filename!: string;

  @AllowNull(false)
  @Column(DataType.BIGINT)
  file_size!: number;

  @AllowNull(false)
  @Column(DataType.STRING(100))
  mime_type!: string;

  @AllowNull(false)
  @Column(DataType.STRING(64))
  file_hash!: string;

  @Column(DataType.STRING(1000))
  original_path?: string;

  @Column(DataType.STRING(1000))
  signed_path?: string;

  @Default('uploaded')
  @Column(DataType.STRING(50))
  status!: string;

  @CreatedAt
  @Column(DataType.DATE)
  created_at!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updated_at!: Date;

  // Associations
  @BelongsTo(() => User)
  user?: User;

  @HasMany(() => Signature)
  signatures?: Signature[];

  /**
   * Check if document is signed
   */
  get isSigned(): boolean {
    return this.status === 'signed';
  }

  /**
   * Get file size in human-readable format
   */
  get fileSizeFormatted(): string {
    const bytes = this.file_size;
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  /**
   * Return safe document data
   */
  toSafeJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      filename: this.filename,
      file_size: this.file_size,
      file_size_formatted: this.fileSizeFormatted,
      mime_type: this.mime_type,
      file_hash: this.file_hash,
      status: this.status,
      is_signed: this.isSigned,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

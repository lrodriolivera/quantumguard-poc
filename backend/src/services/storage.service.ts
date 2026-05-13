/**
 * Storage Service
 * Handles file storage, retrieval, and hash calculations
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';

export class StorageService {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(STORAGE_PATH);
    this.ensureDirectoryExists(this.basePath);
    console.log(`📁 StorageService initialized: ${this.basePath}`);
  }

  /**
   * Ensure a directory exists, create if not
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Get user-specific storage path
   */
  private getUserPath(userId: string): string {
    const userPath = path.join(this.basePath, userId);
    this.ensureDirectoryExists(userPath);
    return userPath;
  }

  /**
   * Generate a unique filename
   */
  private generateUniqueFilename(originalName: string): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    return `${baseName}_${timestamp}_${random}${ext}`;
  }

  /**
   * Calculate SHA-3-256 hash of a buffer (quantum-resistant)
   */
  calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha3-256').update(buffer).digest('hex');
  }

  /**
   * Calculate SHA-3-256 hash of a file (quantum-resistant)
   */
  async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha3-256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Save a file to storage
   */
  async saveFile(
    userId: string,
    buffer: Buffer,
    originalFilename: string
  ): Promise<{ filePath: string; filename: string; hash: string }> {
    const userPath = this.getUserPath(userId);
    const filename = this.generateUniqueFilename(originalFilename);
    const filePath = path.join(userPath, filename);

    await fs.promises.writeFile(filePath, buffer);

    const hash = this.calculateHash(buffer);

    console.log(`✅ File saved: ${filePath}`);

    return {
      filePath,
      filename,
      hash,
    };
  }

  /**
   * Load a file from storage
   */
  async loadFile(userId: string, filename: string): Promise<Buffer> {
    const filePath = path.join(this.getUserPath(userId), filename);

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    return fs.promises.readFile(filePath);
  }

  /**
   * Load file by full path
   */
  async loadFilePath(filePath: string): Promise<Buffer> {
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    return fs.promises.readFile(filePath);
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(userId: string, filename: string): Promise<void> {
    const filePath = path.join(this.getUserPath(userId), filename);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`✅ File deleted: ${filePath}`);
    }
  }

  /**
   * Delete file by full path
   */
  async deleteFilePath(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`✅ File deleted: ${filePath}`);
    }
  }

  /**
   * Check if file exists
   */
  fileExists(userId: string, filename: string): boolean {
    const filePath = path.join(this.getUserPath(userId), filename);
    return fs.existsSync(filePath);
  }

  /**
   * Get file info
   */
  async getFileInfo(
    userId: string,
    filename: string
  ): Promise<{ size: number; created: Date; modified: Date }> {
    const filePath = path.join(this.getUserPath(userId), filename);

    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    const stats = await fs.promises.stat(filePath);

    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
    };
  }

  /**
   * List files for a user
   */
  async listUserFiles(userId: string): Promise<string[]> {
    const userPath = this.getUserPath(userId);

    if (!fs.existsSync(userPath)) {
      return [];
    }

    return fs.promises.readdir(userPath);
  }

  /**
   * Clean up old temporary files (older than specified hours)
   */
  async cleanupOldFiles(hoursOld: number = 24): Promise<number> {
    const cutoffTime = Date.now() - hoursOld * 60 * 60 * 1000;
    let deletedCount = 0;

    const users = await fs.promises.readdir(this.basePath);

    for (const userId of users) {
      const userPath = path.join(this.basePath, userId);
      const stat = await fs.promises.stat(userPath);

      if (!stat.isDirectory()) continue;

      const files = await fs.promises.readdir(userPath);

      for (const file of files) {
        const filePath = path.join(userPath, file);
        const fileStat = await fs.promises.stat(filePath);

        if (fileStat.mtime.getTime() < cutoffTime) {
          await fs.promises.unlink(filePath);
          deletedCount++;
        }
      }
    }

    console.log(`🧹 Cleanup complete: ${deletedCount} files deleted`);
    return deletedCount;
  }
}

// Export singleton instance
export const storageService = new StorageService();

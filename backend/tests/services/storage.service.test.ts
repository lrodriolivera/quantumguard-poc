/**
 * Storage Service Unit Tests
 */

import fs from 'fs';
import path from 'path';
import { StorageService } from '../../src/services/storage.service';

describe('StorageService', () => {
  let storageService: StorageService;
  const testUserId = 'test-user-123';
  const testStoragePath = './test-uploads';

  beforeAll(() => {
    process.env.STORAGE_PATH = testStoragePath;
    storageService = new StorageService();
  });

  afterAll(async () => {
    // Cleanup test directory
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  describe('calculateHash', () => {
    it('should calculate SHA-3-256 hash of buffer', () => {
      const buffer = Buffer.from('test content');
      const hash = storageService.calculateHash(buffer);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-3-256 produces 64 hex characters
    });

    it('should produce consistent hash for same content', () => {
      const buffer1 = Buffer.from('same content');
      const buffer2 = Buffer.from('same content');

      const hash1 = storageService.calculateHash(buffer1);
      const hash2 = storageService.calculateHash(buffer2);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different content', () => {
      const buffer1 = Buffer.from('content 1');
      const buffer2 = Buffer.from('content 2');

      const hash1 = storageService.calculateHash(buffer1);
      const hash2 = storageService.calculateHash(buffer2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('saveFile', () => {
    it('should save a file and return metadata', async () => {
      const buffer = Buffer.from('test file content');
      const filename = 'test-document.txt';

      const result = await storageService.saveFile(testUserId, buffer, filename);

      expect(result).toBeDefined();
      expect(result.filePath).toBeDefined();
      expect(result.filename).toContain('test-document');
      expect(result.filename).toContain('.txt');
      expect(result.hash).toBeDefined();
    });

    it('should create user directory if not exists', async () => {
      const newUserId = `new-user-${Date.now()}`;
      const buffer = Buffer.from('test content');

      const result = await storageService.saveFile(newUserId, buffer, 'test.txt');

      // Check that the file was created (implicitly means directory exists)
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath)).toBe(true);
    });

    it('should generate unique filenames', async () => {
      const buffer = Buffer.from('test content');
      const filename = 'document.pdf';

      const result1 = await storageService.saveFile(testUserId, buffer, filename);
      const result2 = await storageService.saveFile(testUserId, buffer, filename);

      expect(result1.filename).not.toBe(result2.filename);
    });
  });

  describe('loadFile', () => {
    it('should load a saved file', async () => {
      const content = 'file content to load';
      const buffer = Buffer.from(content);
      const { filename } = await storageService.saveFile(testUserId, buffer, 'load-test.txt');

      const loadedBuffer = await storageService.loadFile(testUserId, filename);

      expect(loadedBuffer.toString()).toBe(content);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        storageService.loadFile(testUserId, 'non-existent-file.txt')
      ).rejects.toThrow('File not found');
    });
  });

  describe('deleteFile', () => {
    it('should delete a file', async () => {
      const buffer = Buffer.from('file to delete');
      const { filename } = await storageService.saveFile(testUserId, buffer, 'delete-test.txt');

      await storageService.deleteFile(testUserId, filename);

      expect(storageService.fileExists(testUserId, filename)).toBe(false);
    });

    it('should not throw error for non-existent file', async () => {
      await expect(
        storageService.deleteFile(testUserId, 'non-existent.txt')
      ).resolves.not.toThrow();
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const buffer = Buffer.from('test');
      const { filename } = await storageService.saveFile(testUserId, buffer, 'exists-test.txt');

      expect(storageService.fileExists(testUserId, filename)).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(storageService.fileExists(testUserId, 'no-such-file.txt')).toBe(false);
    });
  });

  describe('getFileInfo', () => {
    it('should return file information', async () => {
      const content = 'test content';
      const buffer = Buffer.from(content);
      const { filename } = await storageService.saveFile(testUserId, buffer, 'info-test.txt');

      const info = await storageService.getFileInfo(testUserId, filename);

      expect(info).toBeDefined();
      expect(info.size).toBe(content.length);
      expect(info.created.getTime()).toBeGreaterThan(0);
      expect(info.modified.getTime()).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        storageService.getFileInfo(testUserId, 'non-existent.txt')
      ).rejects.toThrow('File not found');
    });
  });

  describe('listUserFiles', () => {
    it('should list all files for a user', async () => {
      const uniqueUserId = `list-user-${Date.now()}`;

      await storageService.saveFile(uniqueUserId, Buffer.from('1'), 'file1.txt');
      await storageService.saveFile(uniqueUserId, Buffer.from('2'), 'file2.txt');
      await storageService.saveFile(uniqueUserId, Buffer.from('3'), 'file3.txt');

      const files = await storageService.listUserFiles(uniqueUserId);

      expect(files.length).toBe(3);
    });

    it('should return empty array for user with no files', async () => {
      const files = await storageService.listUserFiles('non-existent-user');

      expect(files).toEqual([]);
    });
  });
});

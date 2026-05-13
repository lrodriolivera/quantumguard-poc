/**
 * Models Index
 * Export all Sequelize models and database utilities
 */

import { sequelize, testConnection, syncDatabase } from './database';
import { User } from './user.model';
import { Document } from './document.model';
import { Signature } from './signature.model';

// Initialize all models
sequelize.addModels([User, Document, Signature]);

/**
 * Initialize database connection and models
 */
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🔄 Initializing database connection...');

    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to database');
    }

    // Sync models in development (don't use force in production!)
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Syncing database models...');
      await syncDatabase(false); // Set to true to drop and recreate tables
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// Export models and utilities
export {
  sequelize,
  testConnection,
  syncDatabase,
  User,
  Document,
  Signature,
};

// Export types
export type { User as UserType } from './user.model';
export type { Document as DocumentType } from './document.model';
export type { Signature as SignatureType } from './signature.model';

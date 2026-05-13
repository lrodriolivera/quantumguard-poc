/**
 * Database Configuration
 * Sequelize connection and initialization
 */

import { Sequelize } from 'sequelize-typescript';
import { config } from 'dotenv';

config();

// Database connection URL from environment
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://quantum_user:quantum_password_2025@localhost:5432/quantumguard';

// Initialize Sequelize without models initially
export const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    timestamps: true,
    underscored: true,
  },
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to database:', error);
    return false;
  }
}

/**
 * Sync database models (development only)
 */
export async function syncDatabase(force = false): Promise<void> {
  try {
    await sequelize.sync({ force });
    console.log(`✅ Database synchronized ${force ? '(forced)' : ''}`);
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    throw error;
  }
}

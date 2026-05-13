import app from './app';
import { initializeDatabase } from './models';

const PORT = process.env.PORT || 5000;

/**
 * Start server with database initialization
 */
async function startServer() {
  try {
    // Initialize database connection and models
    await initializeDatabase();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`
  ╔═══════════════════════════════════════╗
  ║   QuantumGuard AI - Backend API      ║
  ║   Server running on port ${PORT}       ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}            ║
  ╚═══════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

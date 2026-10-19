import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Import routes
import documentRoutes from './routes/document.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import kemRoutes from './routes/kem.routes';
import pkiRoutes from './routes/pki.routes';
import envelopeRoutes from './routes/envelope.routes';
import signRoutes from './routes/sign.routes';
import billingRoutes from './routes/billing.routes';

// Import middleware
import { generalLimiter, authLimiter } from './middleware/rateLimit.middleware';
import { sanitizeInputs } from './middleware/validation.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { billingController } from './controllers/billing.controller';

// Load environment variables
dotenv.config();

class App {
  public app: Application;

  constructor() {
    this.app = express();
    this.config();
    this.routes();
    this.errorHandlers();
  }

  private config(): void {
    // The API is only reachable through the nginx frontend, which overwrites
    // X-Forwarded-For with the real client IP; trust exactly that one hop.
    this.app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Stripe webhook: verifies the signature against the exact raw bytes
    // Stripe sent, so it must be registered before the JSON body parser.
    this.app.post(
      '/api/billing/webhook',
      express.raw({ type: 'application/json', limit: '1mb' }),
      (req: Request, res: Response) => billingController.handleWebhook(req, res)
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Input sanitization
    this.app.use(sanitizeInputs);

    // General rate limiting
    this.app.use(generalLimiter);

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString();
      console.log(`${timestamp} - ${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  private routes(): void {
    // Health check (no rate limit)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'quantumguard-backend-api',
        version: '1.0.0'
      });
    });

    // API info endpoint
    this.app.get('/api', (req: Request, res: Response) => {
      res.json({
        name: 'QuantumGuard API',
        version: '1.0.0',
        description: 'Post-Quantum Digital Signatures API',
        endpoints: {
          auth: '/api/auth',
          documents: '/api/documents',
          users: '/api/users'
        }
      });
    });

    // API routes with specific rate limits
    this.app.use('/api/auth', authLimiter, authRoutes);
    this.app.use('/api/documents', documentRoutes);
    this.app.use('/api/users', usersRoutes);
    this.app.use('/api/kem', kemRoutes);
    this.app.use('/api/pki', pkiRoutes);
    this.app.use('/api/envelopes', envelopeRoutes);
    this.app.use('/api/sign', signRoutes);
    this.app.use('/api/billing', billingRoutes);
  }

  private errorHandlers(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }
}

export default new App().app;

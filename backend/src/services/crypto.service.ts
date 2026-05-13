/**
 * Crypto Service Client
 * HTTP client to communicate with the crypto-service (FastAPI)
 * Includes retry logic and connection error handling
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';

const CRYPTO_SERVICE_URL = process.env.CRYPTO_SERVICE_URL || 'http://localhost:8001';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface KeypairResponse {
  public_key: string;
  algorithm: string;
  created_at: string;
  quantum_safe: boolean;
  key_size: number;
}

interface SignatureResponse {
  signature_id: string;
  document_hash: string;
  signature: string;
  public_key: string;
  algorithm: string;
  timestamp: string;
  valid_until: string;
  quantum_safe: boolean;
  signature_size: number;
}

interface VerificationResponse {
  valid: boolean;
  document_hash: string;
  algorithm: string;
  verification_timestamp: string;
  quantum_safe: boolean;
  details: {
    [key: string]: string;
  };
}

interface KEMKeypairResponse {
  public_key: string;
  secret_key: string;
  algorithm: string;
  public_key_size: number;
  secret_key_size: number;
  created_at: string;
  quantum_safe: boolean;
}

interface EncapsulationResponse {
  ciphertext: string;
  shared_secret: string;
  algorithm: string;
  ciphertext_size: number;
  shared_secret_size: number;
  timestamp: string;
  quantum_safe: boolean;
}

interface DecapsulationResponse {
  shared_secret: string;
  algorithm: string;
  shared_secret_size: number;
  timestamp: string;
  quantum_safe: boolean;
}

export class CryptoService {
  private client: AxiosInstance;
  private isServiceAvailable: boolean = false;

  constructor() {
    this.client = axios.create({
      baseURL: CRYPTO_SERVICE_URL,
      timeout: 30000, // 30 seconds
      headers: {
        'Accept': 'application/json',
      },
    });

    console.log(`🔐 CryptoService initialized: ${CRYPTO_SERVICE_URL}`);

    // Check service availability on startup
    this.checkServiceAvailability();
  }

  /**
   * Check if crypto service is available
   */
  private async checkServiceAvailability(): Promise<void> {
    try {
      const isHealthy = await this.healthCheck();
      this.isServiceAvailable = isHealthy;
      if (isHealthy) {
        console.log('✅ Crypto service is available');
      } else {
        console.warn('⚠️ Crypto service health check failed');
      }
    } catch (error) {
      console.warn('⚠️ Crypto service not available at startup');
      this.isServiceAvailable = false;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute request with retry logic
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isRetryable = this.isRetryableError(error);

        if (attempt < MAX_RETRIES && isRetryable) {
          const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
          console.warn(
            `⚠️ ${operationName} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`
          );
          await this.sleep(delay);
        } else if (!isRetryable) {
          // Don't retry non-retryable errors
          break;
        }
      }
    }

    throw lastError || new Error(`${operationName} failed after ${MAX_RETRIES} attempts`);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: AxiosError): boolean {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Server errors (5xx)
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Timeout errors
    if (error.code === 'ECONNABORTED') {
      return true;
    }

    return false;
  }

  /**
   * Check if crypto service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'healthy';
    } catch (error) {
      console.error('Crypto service health check failed:', error);
      return false;
    }
  }

  /**
   * Generate a new quantum-safe keypair
   */
  async generateKeypair(algorithm: string = 'Dilithium2'): Promise<KeypairResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/keypair/generate', formData, {
        headers: formData.getHeaders(),
      });

      return response.data;
    }, 'generateKeypair');
  }

  /**
   * Sign a document with quantum-safe cryptography
   */
  async signDocument(
    fileBuffer: Buffer,
    filename: string,
    algorithm: string = 'Dilithium2',
    metadata?: any
  ): Promise<SignatureResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('algorithm', algorithm);

      if (metadata) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      const response = await this.client.post('/crypto/sign', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log(`✅ Document signed: ${filename} with ${algorithm}`);
      return response.data;
    }, 'signDocument');
  }

  /**
   * Verify a quantum-safe signature
   */
  async verifySignature(
    fileBuffer: Buffer,
    filename: string,
    signature: string,
    publicKey: string,
    algorithm: string = 'Dilithium2'
  ): Promise<VerificationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('signature', signature);
      formData.append('public_key', publicKey);
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/verify', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log(`✅ Signature verification: ${response.data.valid ? 'VALID' : 'INVALID'}`);
      return response.data;
    }, 'verifySignature');
  }

  /**
   * Sign a document with X.509 certificate + CMS SignedData (RFC 9881/9882)
   */
  async signDocumentX509(
    fileBuffer: Buffer,
    filename: string,
    algorithm: string = 'ML-DSA-44',
  ): Promise<any> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/sign-x509', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log(`✅ Document signed with X.509: ${filename} with ${algorithm}`);
      return response.data;
    }, 'signDocumentX509');
  }

  /**
   * Add visual quantum seal to a PDF
   */
  async addPdfSeal(
    fileBuffer: Buffer,
    filename: string,
    sealData: {
      algorithm: string;
      algorithm_display: string;
      document_hash: string;
      signed_at: string;
      valid_until: string;
      signature_id: string;
      oid?: string;
      nist_standard?: string;
    },
  ): Promise<Buffer> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('algorithm', sealData.algorithm);
      formData.append('algorithm_display', sealData.algorithm_display);
      formData.append('document_hash', sealData.document_hash);
      formData.append('signed_at', sealData.signed_at);
      formData.append('valid_until', sealData.valid_until);
      formData.append('signature_id', sealData.signature_id);
      formData.append('oid', sealData.oid || '');
      formData.append('nist_standard', sealData.nist_standard || 'FIPS 204');

      const response = await this.client.post('/crypto/pdf/seal', formData, {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer',
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      console.log(`✅ PDF seal added: ${filename}`);
      return Buffer.from(response.data);
    }, 'addPdfSeal');
  }

  /**
   * List supported signature algorithms
   */
  async listAlgorithms(): Promise<any> {
    try {
      const response = await this.client.get('/crypto/algorithms');
      return response.data;
    } catch (error: any) {
      console.error('Failed to list algorithms:', error.response?.data || error.message);
      throw new Error(`Failed to list algorithms: ${error.response?.data?.detail || error.message}`);
    }
  }

  // ============================================================
  // KEM Operations (ML-KEM / Kyber)
  // ============================================================

  /**
   * Generate a new KEM keypair
   */
  async generateKEMKeypair(algorithm: string = 'ML-KEM-768'): Promise<KEMKeypairResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/kem/keypair/generate', formData, {
        headers: formData.getHeaders(),
      });

      console.log(`✅ KEM keypair generated: ${algorithm}`);
      return response.data;
    }, 'generateKEMKeypair');
  }

  /**
   * Encapsulate: generate shared secret + ciphertext from public key
   */
  async encapsulate(publicKey: string, algorithm: string = 'ML-KEM-768'): Promise<EncapsulationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('public_key', publicKey);
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/kem/encapsulate', formData, {
        headers: formData.getHeaders(),
      });

      console.log(`✅ KEM encapsulation completed: ${algorithm}`);
      return response.data;
    }, 'encapsulate');
  }

  /**
   * Decapsulate: recover shared secret from ciphertext + secret key
   */
  async decapsulate(ciphertext: string, secretKey: string, algorithm: string = 'ML-KEM-768'): Promise<DecapsulationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('ciphertext', ciphertext);
      formData.append('secret_key', secretKey);
      formData.append('algorithm', algorithm);

      const response = await this.client.post('/crypto/kem/decapsulate', formData, {
        headers: formData.getHeaders(),
      });

      console.log(`✅ KEM decapsulation completed: ${algorithm}`);
      return response.data;
    }, 'decapsulate');
  }

  /**
   * List supported KEM algorithms
   */
  async listKEMAlgorithms(): Promise<any> {
    try {
      const response = await this.client.get('/crypto/kem/algorithms');
      return response.data;
    } catch (error: any) {
      console.error('Failed to list KEM algorithms:', error.response?.data || error.message);
      throw new Error(`Failed to list KEM algorithms: ${error.response?.data?.detail || error.message}`);
    }
  }
}

// Export singleton instance
export const cryptoService = new CryptoService();

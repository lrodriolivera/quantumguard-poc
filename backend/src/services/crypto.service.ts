/**
 * Crypto Service Client
 * HTTP client to communicate with the crypto-service (FastAPI)
 * Includes retry logic and connection error handling
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import https from 'https';

const CRYPTO_SERVICE_URL = process.env.CRYPTO_SERVICE_URL || 'http://localhost:8001';
const CRYPTO_SERVICE_TOKEN = process.env.CRYPTO_SERVICE_TOKEN || '';
// Self-signed crypto-service certificate, pinned as the only trusted CA for this client.
const CRYPTO_TLS_CA_FILE = process.env.CRYPTO_TLS_CA_FILE || '';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface KeypairResponse {
  public_key: string;
  algorithm: string;
  created_at: string;
  quantum_safe: boolean;
  key_size: number;
}

export interface SignatureResponse {
  signature_id: string;
  document_hash: string;
  signature: string;
  public_key: string;
  algorithm: string;
  timestamp: string;
  valid_until?: string;
  quantum_safe: boolean;
  signature_size: number;
}

export interface VerificationResponse {
  valid: boolean;
  document_hash: string;
  algorithm: string;
  verification_timestamp: string;
  quantum_safe: boolean;
  details: {
    [key: string]: string;
  };
}

export interface CertificateSummary {
  subject: string;
  issuer: string;
  serial: string;
  common_name: string | null;
  email: string | null;
  country?: string | null;
  not_before: string;
  not_after: string;
  algorithm: string;
}

export interface X509SignatureResponse extends SignatureResponse {
  country: string;
  hybrid: boolean;
  classical: {
    algorithm: string;
    signature: string;
    cert_pem: string;
    certificate: CertificateSummary;
  } | null;
  time_stamp: { token: string; gen_time: string; serial: string; policy: string };
  signed_pdf: string | null;
  pki: {
    signer_cert_pem: string;
    issuer_cert_pem: string;
    tsa_cert_pem: string;
    ca_cert_pem: string;
    cms_signature_b64: string;
    cms_size: number;
    cms_digest: string;
    oid: string;
    certificate: CertificateSummary;
    verified: boolean;
    standards: string[];
  };
}

export interface X509VerificationResponse extends VerificationResponse {
  signature_valid: boolean;
  chain_valid: boolean;
  revoked: boolean | null;
  within_validity: boolean | null;
  certificate: CertificateSummary;
}

export interface BundleSigner extends CertificateSummary {
  revoked: boolean | null;
  post_quantum: boolean;
}

export interface BundleVerificationResponse extends VerificationResponse {
  reason: string | null;
  cms_valid: boolean;
  revoked: boolean | null;
  hybrid: boolean;
  signers: BundleSigner[];
  time_stamp: { valid: boolean; gen_time: string | null; serial?: string } | null;
  certificate: BundleSigner | null;
}

export interface PdfVerificationResponse {
  valid: boolean;
  reason: string | null;
  hybrid: boolean;
  timestamp: string | null;
  signatures: Array<{
    type: 'signature' | 'timestamp';
    valid: boolean;
    revoked?: boolean | null;
    algorithm?: string | null;
    post_quantum?: boolean;
    signer?: BundleSigner | null;
    gen_time?: string | null;
  }>;
  document_hash: string;
  verification_timestamp: string;
}

export interface TrustMaterial {
  root_pem: string;
  issuing_pem: Record<string, string>;
  tsa_pem: string;
  legacy_pem: string | null;
}

interface KEMKeypairResponse {
  keypair_id: string;
  public_key: string;
  algorithm: string;
  public_key_size: number;
  secret_key_size: number;
  created_at: string;
  expires_at: string;
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

/** The crypto-service rejected the input (HTTP 4xx); safe to report as 400. */
export class CryptoInputError extends Error {}

export class CryptoService {
  private client: AxiosInstance;
  private isServiceAvailable: boolean = false;

  private tlsAgent: https.Agent | null = null;
  private tlsCaMtime = 0;

  constructor() {
    this.client = axios.create({
      baseURL: CRYPTO_SERVICE_URL,
      timeout: 60000,
      headers: {
        'Accept': 'application/json',
        ...(CRYPTO_SERVICE_TOKEN ? { Authorization: `Bearer ${CRYPTO_SERVICE_TOKEN}` } : {}),
      },
    });
    this.client.interceptors.request.use((config) => {
      const agent = this.currentTlsAgent();
      if (agent) config.httpsAgent = agent;
      return config;
    });

    console.log(`🔐 CryptoService initialized: ${CRYPTO_SERVICE_URL}`);

    // Check service availability on startup
    this.checkServiceAvailability();
  }

  /** Re-reads the pinned certificate when the crypto-service rotates it. */
  private currentTlsAgent(): https.Agent | null {
    if (!CRYPTO_TLS_CA_FILE) return null;
    const mtime = fs.statSync(CRYPTO_TLS_CA_FILE).mtimeMs;
    if (!this.tlsAgent || mtime !== this.tlsCaMtime) {
      this.tlsAgent = new https.Agent({ ca: fs.readFileSync(CRYPTO_TLS_CA_FILE), keepAlive: true });
      this.tlsCaMtime = mtime;
    }
    return this.tlsAgent;
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

    const status = (lastError as AxiosError | null)?.response?.status;
    if (status && status >= 400 && status < 500) {
      const detail = ((lastError as AxiosError).response?.data as { detail?: string })?.detail;
      throw new CryptoInputError(detail || `${operationName} rejected the request`);
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
   * Sign a document with a CA-certified key bound to the signer identity
   * (X.509 RFC 9881/9909 + CMS RFC 9882/9814)
   */
  async signDocumentX509(
    fileBuffer: Buffer,
    filename: string,
    algorithm: string,
    signer: { name: string; email: string },
    options: { country: string; hybrid: boolean },
    /** Multi-signer envelopes: stack this signature onto an earlier signer's already-signed PDF. */
    chain?: { previousSignedPdf: Buffer; signerIndex: number },
  ): Promise<X509SignatureResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('algorithm', algorithm);
      formData.append('signer_name', signer.name);
      formData.append('signer_email', signer.email);
      formData.append('country', options.country);
      formData.append('hybrid', String(options.hybrid));
      if (chain) {
        formData.append('previous_signed_pdf', chain.previousSignedPdf, { filename: 'previous-signed.pdf' });
        formData.append('signer_index', String(chain.signerIndex));
      }

      const response = await this.client.post('/crypto/sign-x509', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    }, 'signDocumentX509');
  }

  /**
   * Verify a signature with the key inside a certificate that must chain to our CA
   */
  async verifySignatureX509(
    fileBuffer: Buffer,
    filename: string,
    signature: string,
    certificatePem: string,
    signedAt?: Date,
  ): Promise<X509VerificationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('signature', signature);
      formData.append('certificate', certificatePem);
      if (signedAt) {
        formData.append('signed_at', signedAt.toISOString());
      }

      const response = await this.client.post('/crypto/verify-x509', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    }, 'verifySignatureX509');
  }

  /**
   * Verify a CMS bundle signature (+ RFC 3161 time-stamp): all signers, chain, revocation
   */
  async verifyBundle(
    fileBuffer: Buffer,
    filename: string,
    cmsSignature: string,
    options: { timestampToken?: string | null; signedAt?: Date; requireHybrid?: boolean } = {},
  ): Promise<BundleVerificationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      formData.append('cms_signature', cmsSignature);
      if (options.timestampToken) formData.append('timestamp_token', options.timestampToken);
      if (options.signedAt) formData.append('signed_at', options.signedAt.toISOString());
      if (options.requireHybrid) formData.append('require_hybrid', 'true');

      const response = await this.client.post('/crypto/verify-bundle', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    }, 'verifyBundle');
  }

  /**
   * Verify the signatures embedded in a PDF
   */
  async verifyPdf(fileBuffer: Buffer, filename: string): Promise<PdfVerificationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('file', fileBuffer, { filename });
      const response = await this.client.post('/crypto/pdf/verify', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return response.data;
    }, 'verifyPdf');
  }

  /**
   * Revoke a signer certificate (published in the issuing CA's CRL)
   */
  async revokeCertificate(certificatePem: string, reason: string): Promise<{ serial: string; revoked_at: string }> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('certificate', certificatePem);
      formData.append('reason', reason);
      const response = await this.client.post('/crypto/pki/revoke', formData, { headers: formData.getHeaders() });
      return response.data;
    }, 'revokeCertificate');
  }

  /**
   * QuantumGuard trust material: root, issuing CAs, TSA, legacy CA (PEM)
   */
  async getTrustMaterial(): Promise<TrustMaterial> {
    const response = await this.client.get('/crypto/pki/ca');
    return response.data;
  }

  /**
   * Get the QuantumGuard root CA certificate (PEM)
   */
  async getCaCertificate(): Promise<string> {
    return (await this.getTrustMaterial()).root_pem;
  }

  async getCaFile(name: string): Promise<string> {
    const response = await this.client.get(`/crypto/pki/ca/${encodeURIComponent(name)}.crt`, { responseType: 'text' });
    return response.data;
  }

  async getCrl(name: string): Promise<Buffer> {
    const response = await this.client.get(`/crypto/pki/crl/${encodeURIComponent(name)}.crl`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  async listCountries(): Promise<{ countries: { code: string; name: string }[]; default: string }> {
    const response = await this.client.get('/crypto/pki/countries');
    return response.data;
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
  async decapsulate(ciphertext: string, keypairId: string, algorithm: string = 'ML-KEM-768'): Promise<DecapsulationResponse> {
    return this.withRetry(async () => {
      const formData = new FormData();
      formData.append('ciphertext', ciphertext);
      formData.append('keypair_id', keypairId);
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

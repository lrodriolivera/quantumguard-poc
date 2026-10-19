// User types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// Document types
export interface Document {
  id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileHash: string;
  status: 'pending' | 'signed' | 'verified' | 'failed';
  createdAt: string;
  updatedAt: string;
  signature?: Signature;
}

export interface Signature {
  id: string;
  documentId: string;
  algorithm: string;
  publicKey: string;
  signatureData: string;
  timestamp: string;
  quantumSafe: boolean;
  valid?: boolean;
}

export interface SignDocumentRequest {
  documentId: string;
  algorithm?: 'ML-DSA-44' | 'ML-DSA-65' | 'ML-DSA-87';
}

export interface VerifySignatureRequest {
  documentId?: string;
  file?: File;
  signature?: string;
  publicKey?: string;
}

export interface SignatureResult {
  success: boolean;
  message: string;
  data: {
    documentId: string;
    signature: Signature;
    signedAt: string;
  };
}

export type SignatureCountry = 'CL' | 'CO' | 'ES';

export interface SignOptions {
  country: SignatureCountry;
  hybrid: boolean;
}

// Envelopes: a document routed to one or more signers (self and/or people
// with no QuantumGuard account), confirmed by an email OTP before signing.
export type EnvelopeMode = 'parallel' | 'sequential';
export type EnvelopeStatus = 'draft' | 'sent' | 'completed' | 'voided';
export type EnvelopeSignerStatus =
  | 'pending' | 'notified' | 'viewed' | 'otp_verified' | 'signed' | 'declined';

export interface EnvelopeSignerInput {
  name: string;
  email: string;
  phone?: string;
}

export interface EnvelopeSignerSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  order_index: number;
  status: EnvelopeSignerStatus;
  signature_id: string | null;
  notified_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
}

export interface Envelope {
  id: string;
  document_id: string;
  owner_user_id: string;
  country: SignatureCountry;
  algorithm: string;
  hybrid: boolean;
  mode: EnvelopeMode;
  status: EnvelopeStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  signers: EnvelopeSignerSummary[];
  document?: Document;
}

export interface CreateEnvelopeRequest {
  document_id: string;
  mode: EnvelopeMode;
  country: SignatureCountry;
  algorithm?: string;
  hybrid?: boolean;
  signers: EnvelopeSignerInput[];
}

export interface PublicSignerInfo {
  envelope: { mode: EnvelopeMode; status: EnvelopeStatus };
  document: { filename: string };
  owner_name: string;
  signer: { name: string; email: string; order_index: number; status: EnvelopeSignerStatus };
}

export interface VerificationSigner {
  name: string | null;
  email: string | null;
  country: string | null;
  algorithm?: string;
  serial?: string;
  post_quantum?: boolean;
}

export interface VerificationResult {
  message: string;
  valid: boolean;
  document_hash: string;
  algorithm: string;
  verification_timestamp: string;
  quantum_safe: boolean;
  details: Record<string, string>;
  trusted?: boolean;
  verification_method?: 'certificate_chain' | 'registry' | 'pdf_embedded' | 'none';
  reason?: string;
  signed_at?: string;
  hybrid?: boolean;
  revoked?: boolean;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  time_stamp?: { valid: boolean; gen_time: string | null } | null;
  signer?: VerificationSigner;
  signers?: VerificationSigner[];
  certificate?: {
    subject: string;
    issuer: string;
    serial: string;
    not_before: string;
    not_after: string;
    algorithm: string;
  };
}

// Stats types
export interface UserStats {
  totalDocuments: number;
  signedDocuments: number;
  verifiedDocuments: number;
  pendingDocuments: number;
}

export interface DocumentStats {
  total: number;
  byStatus: {
    pending: number;
    signed: number;
    verified: number;
    failed: number;
  };
  byAlgorithm: Record<string, number>;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'sign' | 'verify' | 'upload' | 'delete';
  documentName: string;
  timestamp: string;
  status: 'success' | 'failed';
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Crypto service types
export interface AlgorithmInfo {
  name: string;
  variant: string;
  securityLevel: number;
  signatureSize: number;
  publicKeySize: number;
  privateKeySize: number;
}

export interface CryptoHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  algorithms: string[];
  version: string;
}

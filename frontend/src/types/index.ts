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

export interface VerificationResult {
  success: boolean;
  message: string;
  data: {
    valid: boolean;
    algorithm: string;
    signedAt: string;
    details: {
      documentHash: string;
      signatureValid: boolean;
      quantumSafe: boolean;
    };
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

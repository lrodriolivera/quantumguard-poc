import api from './api';
import type {
  Document,
  VerificationResult,
  ApiResponse,
} from '../types';

export const documentService = {
  async uploadDocument(file: File): Promise<{ message: string; document: Document }> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async signDocument(
    documentId: string,
    file: File,
    algorithm: string = 'ML-DSA-44'
  ): Promise<{ message: string; document: Document; signature: any }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algorithm);

    const response = await api.post(`/documents/${documentId}/sign`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async verifyDocument(documentId: string): Promise<VerificationResult> {
    const response = await api.post<VerificationResult>('/documents/verify', {
      documentId,
    });
    return response.data;
  },

  async verifyUploadedDocument(file: File): Promise<VerificationResult> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<VerificationResult>('/documents/verify', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async getDocument(documentId: string): Promise<any> {
    const response = await api.get(`/documents/${documentId}`);
    return response.data;
  },

  async listDocuments(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<any> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) {
      params.append('status', status);
    }

    const response = await api.get(`/documents?${params}`);
    return response.data;
  },

  async deleteDocument(documentId: string): Promise<ApiResponse<null>> {
    const response = await api.delete<ApiResponse<null>>(`/documents/${documentId}`);
    return response.data;
  },

  async downloadDocument(documentId: string): Promise<Blob> {
    const response = await api.get(`/documents/${documentId}/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async getStats(): Promise<any> {
    const response = await api.get('/documents/stats');
    return response.data;
  },
};

import JSZip from 'jszip';
import api from './api';
import type {
  Document,
  VerificationResult,
  ApiResponse,
} from '../types';

async function verifyBundleBytes(
  zipBytes: ArrayBuffer
): Promise<VerificationResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch {
    throw new Error(
      'El archivo no es un bundle ZIP firmado de QuantumGuard.'
    );
  }

  const names = Object.keys(zip.files).filter(
    (n) => !zip.files[n].dir
  );
  const originalName = names.find(
    (n) => n.startsWith('original_') && !n.endsWith('.json')
  );
  const certName = names.find((n) => n.endsWith('_quantum_certificate.json'));
  if (!originalName || !certName) {
    throw new Error(
      'El ZIP no es un bundle de firma válido (falta el documento original o el certificado).'
    );
  }

  const certificate = JSON.parse(await zip.files[certName].async('string'));
  const sig = certificate?.signature;
  if (!sig?.signature_data || !sig?.public_key) {
    throw new Error(
      'El certificado no incluye los datos de firma (signature_data / public_key).'
    );
  }

  const originalBlob = await zip.files[originalName].async('blob');
  const originalFileName = originalName.slice('original_'.length);
  const file = new File([originalBlob], originalFileName, {
    type: 'application/octet-stream',
  });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('signature', sig.signature_data);
  formData.append('publicKey', sig.public_key);
  formData.append('algorithm', sig.algorithm || 'ML-DSA-44');

  const response = await api.post<VerificationResult>(
    '/documents/verify',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
}

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
    const blob = await this.downloadDocument(documentId);
    return verifyBundleBytes(await blob.arrayBuffer());
  },

  async verifyUploadedDocument(file: File): Promise<VerificationResult> {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new Error(
        'Sube el bundle ZIP que se descarga al firmar el documento.'
      );
    }
    return verifyBundleBytes(await file.arrayBuffer());
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

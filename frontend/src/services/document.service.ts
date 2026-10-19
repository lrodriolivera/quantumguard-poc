import JSZip from 'jszip';
import api from './api';
import type {
  Document,
  VerificationResult,
  ApiResponse,
  SignOptions,
} from '../types';

async function fileBase64(zip: JSZip, name: string): Promise<string | null> {
  const entry = zip.files[name];
  return entry ? entry.async('base64') : null;
}

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

  const certFile = zip.files['signer_certificate.pem'];
  const signerCertificate = certFile ? await certFile.async('string') : null;
  const cms = await fileBase64(zip, 'signature.p7s');
  const timestampToken = await fileBase64(zip, 'timestamp.tst');

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
  if (signerCertificate) {
    formData.append('certificate', signerCertificate);
  }
  if (cms) {
    formData.append('cms', cms);
  }
  if (timestampToken) {
    formData.append('timestampToken', timestampToken);
  }
  if (sig.hybrid) {
    formData.append('hybrid', 'true');
  }

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
    _file: File,
    algorithm: string = 'ML-DSA-44',
    options: SignOptions = { country: 'CL', hybrid: true }
  ): Promise<{ message: string; document: Document; signature: any }> {
    // The server signs the stored upload; the file itself is not re-sent.
    const formData = new FormData();
    formData.append('algorithm', algorithm);
    formData.append('country', options.country);
    formData.append('hybrid', String(options.hybrid));

    const response = await api.post(`/documents/${documentId}/sign`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  async verifyUploadedDocument(file: File): Promise<VerificationResult> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<VerificationResult>('/documents/verify-pdf', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    }
    if (!name.endsWith('.zip')) {
      throw new Error(
        'Sube el bundle ZIP o el PDF firmado que se descargan al firmar el documento.'
      );
    }
    return verifyBundleBytes(await file.arrayBuffer());
  },

  async revokeLatestSignature(documentId: string, reason: string): Promise<void> {
    const detail = await api.get(`/documents/${documentId}`);
    const latest = detail.data?.signatures?.[0];
    if (!latest) {
      throw new Error('El documento no tiene firmas');
    }
    await api.post(`/documents/${documentId}/signatures/${latest.id}/revoke`, { reason });
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

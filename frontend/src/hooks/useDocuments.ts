import { useState, useCallback } from 'react';
import { documentService } from '../services/document.service';
import type { Document, DocumentStats } from '../types';

interface UseDocumentsReturn {
  documents: Document[];
  document: Document | null;
  stats: DocumentStats | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
  fetchDocuments: (page?: number, status?: string) => Promise<void>;
  fetchDocument: (id: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  uploadDocument: (file: File) => Promise<Document>;
  signDocument: (documentId: string, file: File, algorithm?: string) => Promise<any>;
  deleteDocument: (documentId: string) => Promise<void>;
  clearError: () => void;
}

export function useDocuments(): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [document, setDocument] = useState<Document | null>(null);
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

  const fetchDocuments = useCallback(async (page: number = 1, status?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentService.listDocuments(page, 10, status);
      const docs = response.data || response.documents || [];
      setDocuments(Array.isArray(docs) ? docs : []);
      const pag = response.pagination || { page: 1, totalPages: 1, total: 0 };
      setPagination({
        page: pag.page || 1,
        totalPages: pag.totalPages || 1,
        total: pag.total || 0,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error al cargar documentos');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDocument = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentService.getDocument(id);
      setDocument(response.data || response.document || response);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error al cargar documento');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentService.getStats();
      setStats(response.data || response.stats || response);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Error al cargar estadisticas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadDocument = useCallback(async (file: File): Promise<Document> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await documentService.uploadDocument(file);
      return response.document;
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Error al subir documento';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signDocument = useCallback(
    async (documentId: string, file: File, algorithm?: string): Promise<any> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await documentService.signDocument(documentId, file, algorithm);
        return response;
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Error al firmar documento';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const deleteDocument = useCallback(async (documentId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await documentService.deleteDocument(documentId);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Error al eliminar documento';
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    documents,
    document,
    stats,
    isLoading,
    error,
    pagination,
    fetchDocuments,
    fetchDocument,
    fetchStats,
    uploadDocument,
    signDocument,
    deleteDocument,
    clearError,
  };
}

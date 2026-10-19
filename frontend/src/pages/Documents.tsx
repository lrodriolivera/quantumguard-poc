import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Trash2,
  Eye,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';
import { documentService } from '../services/document.service';
import {
  Card,
  CardContent,
  Button,
  Input,
  Spinner,
  Alert,
  Modal,
} from '../components/ui';
import type { Document } from '../types';

const REVOCATION_REASONS = [
  { value: 'unspecified', label: 'Sin especificar' },
  { value: 'keyCompromise', label: 'Clave o cuenta comprometida' },
  { value: 'superseded', label: 'Reemplazada por una nueva firma' },
  { value: 'affiliationChanged', label: 'Cambio de cargo o afiliación' },
  { value: 'cessationOfOperation', label: 'El documento ya no está vigente' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'signed', label: 'Firmados' },
  { value: 'verified', label: 'Verificados' },
  { value: 'failed', label: 'Fallidos' },
];

export default function Documents() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteModal, setDeleteModal] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [revokeModal, setRevokeModal] = useState<Document | null>(null);
  const [revokeReason, setRevokeReason] = useState('unspecified');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeMessage, setRevokeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const {
    documents,
    isLoading,
    error,
    pagination,
    fetchDocuments,
    deleteDocument,
    clearError,
  } = useDocuments();

  useEffect(() => {
    fetchDocuments(1, statusFilter);
  }, [fetchDocuments, statusFilter]);

  const handleDelete = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDocument(deleteModal.id);
      setDeleteModal(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeModal) return;
    setIsRevoking(true);
    try {
      await documentService.revokeLatestSignature(revokeModal.id, revokeReason);
      setRevokeMessage({
        type: 'success',
        text: `Firma de "${revokeModal.originalName || revokeModal.filename}" revocada: ya no verificará como válida.`,
      });
      setRevokeModal(null);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setRevokeMessage({
        type: 'error',
        text: e.response?.data?.message || e.message || 'No se pudo revocar la firma',
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await documentService.downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const originalName = doc.originalName || doc.filename;
      if (doc.status === 'signed' || doc.status === 'verified') {
        const baseName = originalName.replace(/\.[^/.]+$/, '');
        a.download = `${baseName}_signed.zip`;
      } else {
        a.download = originalName;
      }
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      // Error handling
    }
  };

  const filteredDocuments = documents.filter(
    (doc) =>
      (doc.originalName || doc.filename)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'signed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'verified':
        return <Shield className="w-4 h-4 text-blue-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'signed':
        return 'Firmado';
      case 'verified':
        return 'Verificado';
      case 'pending':
        return 'Pendiente';
      case 'failed':
        return 'Fallido';
      default:
        return status;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mis Documentos</h1>
          <p className="text-gray-600 mt-1">
            {pagination.total} documento{pagination.total !== 1 ? 's' : ''} en total
          </p>
        </div>
        <Link to="/sign">
          <Button leftIcon={<Plus className="w-5 h-5" />}>
            Nuevo Documento
          </Button>
        </Link>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-quantum-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay documentos
              </h3>
              <p className="text-gray-500 mb-6">
                {searchTerm || statusFilter
                  ? 'No se encontraron documentos con los filtros aplicados.'
                  : 'Comienza subiendo tu primer documento para firmar.'}
              </p>
              <Link to="/sign">
                <Button leftIcon={<Plus className="w-5 h-5" />}>
                  Subir Documento
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredDocuments.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className="p-3 bg-gray-100 rounded-xl">
                      <FileText className="w-6 h-6 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">
                        {doc.originalName || doc.filename}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span>{formatFileSize(doc.size)}</span>
                        <span>{new Date(doc.createdAt).toLocaleDateString('es-ES')}</span>
                        <span className="flex items-center space-x-1">
                          {getStatusIcon(doc.status)}
                          <span>{getStatusLabel(doc.status)}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Link to={`/documents/${doc.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(doc)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    {(doc.status === 'signed' || doc.status === 'verified') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRevokeReason('unspecified');
                          setRevokeModal(doc);
                        }}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        aria-label="Revocar firma"
                        title="Revocar firma"
                      >
                        <ShieldOff className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteModal(doc)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex justify-center space-x-2 pt-4">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={page === pagination.page ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => fetchDocuments(page, statusFilter)}
                >
                  {page}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {revokeMessage && (
        <div className="fixed bottom-6 right-6 max-w-sm z-50">
          <Alert variant={revokeMessage.type} onClose={() => setRevokeMessage(null)}>
            {revokeMessage.text}
          </Alert>
        </div>
      )}

      {/* Revoke Signature Modal */}
      <Modal
        isOpen={!!revokeModal}
        onClose={() => setRevokeModal(null)}
        title="Revocar firma"
        size="sm"
      >
        <div>
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldOff className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-gray-600 mb-4 text-center">
            La firma más reciente de "{revokeModal?.originalName || revokeModal?.filename}" se publicará
            en la lista de revocación (CRL) y dejará de verificar como válida. No se puede deshacer.
          </p>
          <label htmlFor="revoke-reason" className="block text-sm font-medium text-gray-700 mb-1">
            Motivo
          </label>
          <select
            id="revoke-reason"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-quantum-500"
          >
            {REVOCATION_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <div className="flex space-x-3 justify-center">
            <Button variant="outline" onClick={() => setRevokeModal(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleRevoke} isLoading={isRevoking}>
              Revocar firma
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Eliminar documento"
        size="sm"
      >
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-gray-600 mb-6">
            Estas seguro de que deseas eliminar "{deleteModal?.originalName || deleteModal?.filename}"?
            Esta accion no se puede deshacer.
          </p>
          <div className="flex space-x-3 justify-center">
            <Button variant="outline" onClick={() => setDeleteModal(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={isDeleting}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Shield,
  CheckCircle,
  Clock,
  PenTool,
  Search,
  ArrowRight,
  Key,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import { Card, CardContent, Button, Spinner, Alert } from '../components/ui';

export default function Dashboard() {
  const { user } = useAuth();
  const { stats, documents, isLoading, error, fetchStats, fetchDocuments } = useDocuments();

  useEffect(() => {
    fetchStats();
    fetchDocuments(1);
  }, [fetchStats, fetchDocuments]);

  const statCards = [
    {
      title: 'Total Documentos',
      value: stats?.total || 0,
      icon: FileText,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      title: 'Firmados',
      value: stats?.byStatus?.signed || 0,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      title: 'Pendientes',
      value: stats?.byStatus?.pending || 0,
      icon: Clock,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
    },
    {
      title: 'Verificados',
      value: stats?.byStatus?.verified || 0,
      icon: Shield,
      color: 'text-quantum-600',
      bg: 'bg-quantum-100',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Bienvenido, {user?.firstName || 'Usuario'}!
        </h1>
        <p className="mt-2 text-gray-600">
          Gestiona tus documentos con firmas digitales post-cuanticas seguras.
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6">
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title} className="relative overflow-hidden">
            <CardContent className="py-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {isLoading ? <Spinner size="sm" /> : stat.value}
                  </p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-quantum-500 to-quantum-700 text-white">
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Firmar Documento</h3>
                <p className="text-quantum-100 mb-4">
                  Firma con ML-DSA o SLH-DSA (SPHINCS+) post-cuantico.
                </p>
                <Link to="/sign">
                  <Button
                    variant="outline"
                    className="border-white text-white hover:bg-white/10"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Firmar Ahora
                  </Button>
                </Link>
              </div>
              <PenTool className="w-12 h-12 text-quantum-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500 to-green-700 text-white">
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Verificar Firma</h3>
                <p className="text-green-100 mb-4">
                  Verifica la autenticidad de documentos firmados.
                </p>
                <Link to="/verify">
                  <Button
                    variant="outline"
                    className="border-white text-white hover:bg-white/10"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Verificar Ahora
                  </Button>
                </Link>
              </div>
              <Search className="w-12 h-12 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-700 text-white">
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Encapsulacion KEM</h3>
                <p className="text-amber-100 mb-4">
                  Explora ML-KEM (Kyber) para intercambio de claves.
                </p>
                <Link to="/kem">
                  <Button
                    variant="outline"
                    className="border-white text-white hover:bg-white/10"
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Explorar KEM
                  </Button>
                </Link>
              </div>
              <Key className="w-12 h-12 text-amber-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Documents */}
      <Card>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Documentos Recientes
            </h3>
            <Link
              to="/documents"
              className="text-quantum-600 hover:text-quantum-700 text-sm font-medium"
            >
              Ver todos
            </Link>
          </div>
        </div>
        <CardContent className="py-0">
          {isLoading ? (
            <div className="py-8 flex justify-center">
              <Spinner />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No tienes documentos aun.</p>
              <Link to="/sign" className="text-quantum-600 hover:text-quantum-700 text-sm">
                Sube tu primer documento
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {documents.slice(0, 5).map((doc) => (
                <div
                  key={doc.id}
                  className="py-4 flex items-center justify-between hover:bg-gray-50 -mx-4 px-4"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <FileText className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{doc.originalName || doc.filename}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        doc.status === 'signed'
                          ? 'bg-green-100 text-green-700'
                          : doc.status === 'verified'
                          ? 'bg-blue-100 text-blue-700'
                          : doc.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {doc.status === 'signed'
                        ? 'Firmado'
                        : doc.status === 'verified'
                        ? 'Verificado'
                        : doc.status === 'pending'
                        ? 'Pendiente'
                        : 'Fallido'}
                    </span>
                    <Link
                      to={`/documents/${doc.id}`}
                      className="text-quantum-600 hover:text-quantum-700"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Link } from 'react-router-dom';
import {
  Shield,
  Lock,
  Zap,
  CheckCircle,
  ArrowRight,
  FileText,
  Search,
} from 'lucide-react';
import { Button } from '../components/ui';

export default function Home() {
  const features = [
    {
      icon: Shield,
      title: 'Post-Cuantico',
      description:
        'Algoritmos ML-DSA (Dilithium) certificados por NIST, resistentes a ataques de computadoras cuanticas.',
    },
    {
      icon: Lock,
      title: 'Seguridad Maxima',
      description:
        'Proteccion criptografica de nivel militar para tus documentos mas importantes.',
    },
    {
      icon: Zap,
      title: 'Ultra Rapido',
      description:
        'Firma documentos en milisegundos. Mas de 2,600 firmas por segundo.',
    },
    {
      icon: CheckCircle,
      title: 'Verificacion Instantanea',
      description:
        'Verifica la autenticidad de cualquier documento firmado al instante.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-quantum-600 via-quantum-700 to-quantum-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center px-4 py-2 bg-white/10 rounded-full mb-6">
              <Shield className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Tecnologia Post-Cuantica NIST</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Firmas Digitales del{' '}
              <span className="text-quantum-200">Futuro</span>
            </h1>
            <p className="text-xl text-quantum-100 mb-10 max-w-2xl mx-auto">
              Protege tus documentos con criptografia post-cuantica. Seguridad
              garantizada incluso contra computadoras cuanticas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button
                  size="lg"
                  className="bg-quantum-900 text-white border-2 border-white hover:bg-white hover:text-quantum-900"
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                >
                  Comenzar Ahora
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white/10"
                >
                  Iniciar Sesion
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 100L60 91.7C120 83.3 240 66.7 360 58.3C480 50 600 50 720 54.2C840 58.3 960 66.7 1080 66.7C1200 66.7 1320 58.3 1380 54.2L1440 50V100H1380C1320 100 1200 100 1080 100C960 100 840 100 720 100C600 100 480 100 360 100C240 100 120 100 60 100H0Z"
              fill="#f9fafb"
            />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Por que QuantumGuard?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              La primera plataforma de firmas digitales preparada para la era
              cuantica en Latinoamerica.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-quantum-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-quantum-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Como Funciona
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Firma y verifica documentos en tres simples pasos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-quantum-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                1
              </div>
              <div className="p-2 bg-quantum-50 rounded-xl inline-block mb-4">
                <FileText className="w-8 h-8 text-quantum-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Sube tu documento
              </h3>
              <p className="text-gray-600">
                Arrastra y suelta o selecciona el documento que deseas firmar.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-quantum-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                2
              </div>
              <div className="p-2 bg-quantum-50 rounded-xl inline-block mb-4">
                <Shield className="w-8 h-8 text-quantum-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Firma con ML-DSA
              </h3>
              <p className="text-gray-600">
                Aplicamos una firma digital post-cuantica en milisegundos.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-quantum-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                3
              </div>
              <div className="p-2 bg-quantum-50 rounded-xl inline-block mb-4">
                <Search className="w-8 h-8 text-quantum-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Verifica cuando quieras
              </h3>
              <p className="text-gray-600">
                Cualquiera puede verificar la autenticidad del documento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-quantum-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Listo para el Futuro?
          </h2>
          <p className="text-quantum-200 mb-8 text-lg">
            Unete a las empresas que ya protegen sus documentos con tecnologia
            post-cuantica.
          </p>
          <Link to="/register">
            <Button
              size="lg"
              className="bg-white text-quantum-700 hover:bg-quantum-50"
              rightIcon={<ArrowRight className="w-5 h-5" />}
            >
              Crear Cuenta
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

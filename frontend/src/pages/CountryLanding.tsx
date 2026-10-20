import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Lock,
  Zap,
  CheckCircle,
  XCircle,
  ArrowRight,
  FileText,
  Search,
} from 'lucide-react';
import { Button } from '../components/ui';
import { useCountry, type SelectableCountry } from '../context/CountryContext';

interface CountryContent {
  name: string;
  legalBasis: string;
  caName: string;
  silhouette: string;
  canSign: string[];
  cannotSign: string[];
  advancedNote: string;
  classes: {
    hero: string;
    heroAccentText: string;
    badge: string;
    silhouette: string;
    ctaSection: string;
    ctaButton: string;
    canCard: string;
    cannotCard: string;
  };
}

const CANNOT_SIGN_COMMON = [
  'Testamentos y actos de última voluntad.',
  'Compraventa, hipoteca o constitución de gravámenes sobre bienes inmuebles.',
  'Constitución o modificación de sociedades que exija escritura pública.',
  'Actos del estado civil (matrimonio, reconocimiento de hijos, divorcio).',
  'Poderes que la ley exija otorgar ante notario.',
  'Pagarés, letras de cambio y otros títulos valores con requisitos formales propios.',
];

const CONTENT: Record<SelectableCountry, CountryContent> = {
  CL: {
    name: 'Chile',
    legalBasis: 'Ley 19.799 sobre documentos electrónicos y firma electrónica',
    caName: 'QuantumGuard CA Chile',
    silhouette:
      'M0 100 L60 20 L90 70 L140 10 L190 75 L240 25 L300 80 L360 15 L420 70 L480 30 L540 85 L600 20 L660 75 L720 35 L780 90 L840 25 L900 70 L960 40 L1020 85 L1080 30 L1140 75 L1200 45 L1260 90 L1320 35 L1380 75 L1440 50 V100 Z',
    canSign: [
      'Contratos comerciales, acuerdos de servicios y cotizaciones.',
      'Políticas internas, NDA y acuerdos de confidencialidad.',
      'Finiquitos y documentos laborales que no exijan escritura pública.',
      'Cualquier acto civil o comercial que la ley no reserve a notario — con firma avanzada, equivalente a la manuscrita.',
    ],
    cannotSign: CANNOT_SIGN_COMMON,
    advancedNote:
      'La firma simple tiene valor probatorio y se admite como prueba en juicio. La firma avanzada post-cuántica de QuantumGuard — certificada por nuestra jerarquía de CA — equivale a la firma manuscrita para la generalidad de los actos, salvo las excepciones de la izquierda.',
    classes: {
      hero: 'bg-gradient-to-br from-cl-700 via-cl-800 to-cl-950',
      heroAccentText: 'text-cl-accent',
      badge: 'bg-white/10 text-cl-100',
      silhouette: 'text-cl-600',
      ctaSection: 'bg-cl-950',
      ctaButton: 'bg-cl-accent text-white border-2 border-cl-accent hover:bg-red-700 hover:border-red-700',
      canCard: 'border-cl-200 bg-cl-50',
      cannotCard: 'border-amber-200 bg-amber-50',
    },
  },
  CO: {
    name: 'Colombia',
    legalBasis: 'Ley 527 de 1999 y su reglamentación (Decreto 2364 de 2012, Decreto 333 de 2014)',
    caName: 'QuantumGuard CA Colombia',
    silhouette:
      'M0 100 Q80 20 160 65 Q220 15 300 60 Q360 20 440 70 Q500 25 580 65 Q660 15 740 70 Q820 30 900 65 Q980 20 1060 70 Q1140 25 1220 65 Q1320 20 1440 60 V100 Z',
    canSign: [
      'Contratos comerciales, acuerdos de servicios y cotizaciones.',
      'Políticas internas, NDA y acuerdos de confidencialidad.',
      'Actas y documentos internos que no exijan escritura pública.',
      'Cualquier acto civil o comercial — con firma digital (PKI), con presunción legal de equivalencia a la firma manuscrita.',
    ],
    cannotSign: CANNOT_SIGN_COMMON,
    advancedNote:
      'La firma electrónica simple es admisible como medio de prueba; su valor depende de la fiabilidad del método usado para identificar al firmante. La firma digital de QuantumGuard, basada en PKI, goza de presunción legal de equivalencia con la firma manuscrita, salvo las excepciones de la izquierda.',
    classes: {
      hero: 'bg-gradient-to-br from-co-ink-700 via-co-ink-800 to-co-ink-950',
      heroAccentText: 'text-co-400',
      badge: 'bg-white/10 text-co-100',
      silhouette: 'text-co-700',
      ctaSection: 'bg-co-ink-950',
      ctaButton: 'bg-co-400 text-co-ink-950 border-2 border-co-400 hover:bg-co-300 hover:border-co-300',
      canCard: 'border-co-200 bg-co-50',
      cannotCard: 'border-amber-200 bg-amber-50',
    },
  },
};

const FEATURES = [
  {
    icon: Shield,
    title: 'Post-Cuántico',
    description:
      'Algoritmos ML-DSA (Dilithium) certificados por NIST, resistentes a ataques de computadoras cuánticas.',
  },
  {
    icon: Lock,
    title: 'Seguridad Máxima',
    description: 'Protección criptográfica de nivel militar para tus documentos más importantes.',
  },
  {
    icon: Zap,
    title: 'Ultra Rápido',
    description: 'Firma documentos en milisegundos. Más de 2,600 firmas por segundo.',
  },
  {
    icon: CheckCircle,
    title: 'Verificación Instantánea',
    description: 'Verifica la autenticidad de cualquier documento firmado al instante.',
  },
];

const STEPS = [
  {
    icon: FileText,
    title: 'Sube tu documento',
    description: 'Arrastra y suelta o selecciona el documento que deseas firmar.',
  },
  {
    icon: Shield,
    title: 'Firma con ML-DSA',
    description: 'Aplicamos una firma digital post-cuántica en milisegundos.',
  },
  {
    icon: Search,
    title: 'Verifica cuando quieras',
    description: 'Cualquiera puede verificar la autenticidad del documento.',
  },
];

interface CountryLandingProps {
  country: SelectableCountry;
}

export default function CountryLanding({ country }: CountryLandingProps) {
  const { setCountry } = useCountry();
  const content = CONTENT[country];

  useEffect(() => {
    setCountry(country);
  }, [country, setCountry]);

  return (
    <div className="min-h-screen">
      <section className={`relative ${content.classes.hero} text-white overflow-hidden`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 relative">
          <div className="text-center max-w-3xl mx-auto">
            <div
              className={`inline-flex items-center px-4 py-2 rounded-full mb-6 ${content.classes.badge}`}
            >
              <Shield className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">{content.name} · {content.legalBasis}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Firma digital post-cuántica{' '}
              <span className={content.classes.heroAccentText}>para {content.name}</span>
            </h1>
            <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
              Certificado emitido por {content.caName}, con validez bajo la {content.legalBasis}.
              Seguridad garantizada incluso contra computadoras cuánticas.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button
                  size="lg"
                  className={content.classes.ctaButton}
                  rightIcon={<ArrowRight className="w-5 h-5" />}
                >
                  Comenzar Ahora
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Iniciar Sesión
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Subtle mountain-range silhouette, distinct per country */}
        <svg
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          className={`absolute bottom-0 left-0 w-full h-20 opacity-40 ${content.classes.silhouette}`}
          aria-hidden="true"
        >
          <path d={content.silhouette} fill="currentColor" />
        </svg>
      </section>

      {/* Qué sí / qué no se puede firmar — detallado por país */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              ¿Qué puedes firmar en {content.name}?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">{content.advancedNote}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className={`rounded-2xl border-2 p-6 ${content.classes.canCard}`}>
              <h3 className="flex items-center text-lg font-semibold text-gray-900 mb-4">
                <CheckCircle className="w-5 h-5 mr-2 text-emerald-600" /> Sí puedes firmar
              </h3>
              <ul className="space-y-2.5">
                {content.canSign.map((item) => (
                  <li key={item} className="flex items-start text-sm text-gray-700">
                    <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className={`rounded-2xl border-2 p-6 ${content.classes.cannotCard}`}>
              <h3 className="flex items-center text-lg font-semibold text-amber-900 mb-4">
                <XCircle className="w-5 h-5 mr-2 text-amber-600" /> No puedes firmar con firma simple
              </h3>
              <ul className="space-y-2.5">
                {content.cannotSign.map((item) => (
                  <li key={item} className="flex items-start text-sm text-amber-900">
                    <XCircle className="w-4 h-4 mr-2 mt-0.5 text-amber-600 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400 mt-6">
            Lista orientativa, no exhaustiva, sujeta a la {content.legalBasis}. Si tienes dudas sobre
            un documento específico, consulta con un abogado — QuantumGuard no brinda asesoría legal.{' '}
            <Link to="/terminos" className="text-quantum-600 hover:underline">
              Ver términos completos →
            </Link>
          </p>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">¿Por qué QuantumGuard?</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              La primera plataforma de firmas digitales preparada para la era cuántica en
              Latinoamérica.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-quantum-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-quantum-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Cómo Funciona</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Firma y verifica documentos en tres simples pasos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="w-16 h-16 bg-quantum-600 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                  {i + 1}
                </div>
                <div className="p-2 bg-quantum-50 rounded-xl inline-block mb-4">
                  <step.icon className="w-8 h-8 text-quantum-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`py-20 ${content.classes.ctaSection}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">¿Listo para firmar en {content.name}?</h2>
          <p className="text-white/70 mb-8 text-lg">
            Únete a quienes ya protegen sus documentos con tecnología post-cuántica.
          </p>
          <Link to="/register">
            <Button size="lg" className="bg-white text-gray-900 hover:bg-gray-100" rightIcon={<ArrowRight className="w-5 h-5" />}>
              Crear Cuenta
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

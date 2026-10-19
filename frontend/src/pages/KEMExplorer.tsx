import { useState } from 'react';
import { Key, ArrowRight, CheckCircle, Shield, Copy } from 'lucide-react';
import { kemService } from '../services/kem.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Alert,
} from '../components/ui';

const KEM_ALGORITHMS = [
  {
    id: 'ML-KEM-512',
    name: 'ML-KEM-512 (Kyber512)',
    description: 'Nivel 1 - Rapido, menor seguridad',
    level: 1,
  },
  {
    id: 'ML-KEM-768',
    name: 'ML-KEM-768 (Kyber768)',
    description: 'Nivel 3 - Recomendado para uso general',
    level: 3,
  },
  {
    id: 'ML-KEM-1024',
    name: 'ML-KEM-1024 (Kyber1024)',
    description: 'Nivel 5 - Maxima seguridad',
    level: 5,
  },
];

interface KEMState {
  publicKey: string;
  keypairId: string;
  expiresAt: string;
  ciphertext: string;
  sharedSecret1: string;
  sharedSecret2: string;
}

export default function KEMExplorer() {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('ML-KEM-768');
  const [step, setStep] = useState<'select' | 'keypair' | 'encapsulated' | 'verified'>('select');
  const [kemState, setKemState] = useState<KEMState>({
    publicKey: '', keypairId: '', expiresAt: '', ciphertext: '', sharedSecret1: '', sharedSecret2: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const truncate = (str: string, len: number = 40) =>
    str.length > len ? str.substring(0, len) + '...' : str;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleGenerateKeypair = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await kemService.generateKeypair(selectedAlgorithm);
      setKemState(prev => ({
        ...prev,
        publicKey: result.public_key,
        keypairId: result.keypair_id,
        expiresAt: result.expires_at,
      }));
      setStep('keypair');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error generando keypair');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEncapsulate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await kemService.encapsulate(kemState.publicKey, selectedAlgorithm);
      setKemState(prev => ({
        ...prev,
        ciphertext: result.ciphertext,
        sharedSecret1: result.shared_secret,
      }));
      setStep('encapsulated');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error en encapsulacion');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecapsulate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await kemService.decapsulate(kemState.ciphertext, kemState.keypairId, selectedAlgorithm);
      setKemState(prev => ({
        ...prev,
        sharedSecret2: result.shared_secret,
      }));
      setStep('verified');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error en decapsulacion');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStep('select');
    setKemState({ publicKey: '', keypairId: '', expiresAt: '', ciphertext: '', sharedSecret1: '', sharedSecret2: '' });
    setError(null);
  };

  const secretsMatch = kemState.sharedSecret1 && kemState.sharedSecret2 && kemState.sharedSecret1 === kemState.sharedSecret2;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Key className="w-8 h-8 text-amber-600" />
          <h1 className="text-3xl font-bold text-gray-900">Encapsulacion de Claves</h1>
        </div>
        <p className="text-gray-600">
          Explora ML-KEM (CRYSTALS-Kyber, FIPS 203) para intercambio de claves post-cuantico.
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Step 1: Select Algorithm */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>1. Selecciona el algoritmo ML-KEM</CardTitle>
        </CardHeader>
        <CardContent className="py-0">
          <div className="space-y-3">
            {KEM_ALGORITHMS.map((algo) => (
              <label
                key={algo.id}
                className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                  selectedAlgorithm === algo.id
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${step !== 'select' ? 'opacity-60 pointer-events-none' : ''}`}
              >
                <input
                  type="radio"
                  name="kem-algorithm"
                  value={algo.id}
                  checked={selectedAlgorithm === algo.id}
                  onChange={(e) => setSelectedAlgorithm(e.target.value)}
                  className="sr-only"
                  disabled={step !== 'select'}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">{algo.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      algo.level <= 2 ? 'bg-green-100 text-green-700'
                      : algo.level === 3 ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                    }`}>Nivel {algo.level}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{algo.description}</p>
                </div>
                <Key className={`w-6 h-6 ${selectedAlgorithm === algo.id ? 'text-amber-600' : 'text-gray-300'}`} />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Generate Keypair */}
      {step === 'select' && (
        <Button onClick={handleGenerateKeypair} className="w-full mb-6" size="lg" isLoading={isLoading}
          leftIcon={<Key className="w-5 h-5" />}>
          Generar Keypair KEM
        </Button>
      )}

      {/* Keypair Result */}
      {step !== 'select' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>2. Keypair Generado</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 space-y-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500">Clave Publica</span>
                <button onClick={() => copyToClipboard(kemState.publicKey, 'pk')} className="text-xs text-quantum-600 hover:text-quantum-700 flex items-center">
                  <Copy className="w-3 h-3 mr-1" />{copied === 'pk' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="font-mono text-xs text-gray-700 break-all">{truncate(kemState.publicKey, 80)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500">Clave Secreta</span>
                <span className="text-xs text-gray-400">ID {kemState.keypairId.slice(0, 8)}</span>
              </div>
              <p className="text-xs text-gray-700">
                Se queda en el servidor y nunca viaja por la red. Caduca{' '}
                {kemState.expiresAt && new Date(kemState.expiresAt).toLocaleTimeString('es-ES')}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Encapsulate */}
      {step === 'keypair' && (
        <Button onClick={handleEncapsulate} className="w-full mb-6" size="lg" isLoading={isLoading}
          leftIcon={<ArrowRight className="w-5 h-5" />}>
          Encapsular (Generar Shared Secret)
        </Button>
      )}

      {/* Encapsulation Result */}
      {(step === 'encapsulated' || step === 'verified') && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>3. Encapsulacion Completada</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 space-y-3">
            <div className="bg-amber-50 rounded-lg p-3">
              <span className="text-xs font-medium text-amber-700">Ciphertext</span>
              <p className="font-mono text-xs text-gray-700 break-all mt-1">{truncate(kemState.ciphertext, 80)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <span className="text-xs font-medium text-green-700">Shared Secret (emisor)</span>
              <p className="font-mono text-xs text-gray-700 break-all mt-1">{truncate(kemState.sharedSecret1, 80)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Decapsulate */}
      {step === 'encapsulated' && (
        <Button onClick={handleDecapsulate} className="w-full mb-6" size="lg" isLoading={isLoading}
          leftIcon={<Shield className="w-5 h-5" />}>
          Decapsular (Recuperar Shared Secret)
        </Button>
      )}

      {/* Verification Result */}
      {step === 'verified' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span>4. Decapsulacion Completada</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 space-y-3">
            <div className="bg-green-50 rounded-lg p-3">
              <span className="text-xs font-medium text-green-700">Shared Secret (receptor)</span>
              <p className="font-mono text-xs text-gray-700 break-all mt-1">{truncate(kemState.sharedSecret2, 80)}</p>
            </div>

            <div className={`rounded-xl p-4 text-center ${secretsMatch ? 'bg-green-100' : 'bg-red-100'}`}>
              {secretsMatch ? (
                <>
                  <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="font-bold text-green-800">Shared Secrets Coinciden</p>
                  <p className="text-sm text-green-700 mt-1">
                    Intercambio de claves post-cuantico exitoso con {selectedAlgorithm}
                  </p>
                </>
              ) : (
                <p className="font-bold text-red-800">Los Shared Secrets NO coinciden</p>
              )}
            </div>

            <div className="pt-2">
              <Button onClick={handleReset} variant="outline" className="w-full">
                Reiniciar Demo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent>
          <h4 className="font-semibold text-gray-900 mb-2">Que es ML-KEM (Kyber)?</h4>
          <p className="text-sm text-gray-600">
            ML-KEM (FIPS 203) es un mecanismo de encapsulacion de claves basado en lattices,
            estandarizado por NIST. Permite que dos partes establezcan una clave secreta compartida
            de forma segura, resistente a ataques de computadoras cuanticas. El shared secret
            generado puede usarse como clave AES-256 para cifrar comunicaciones.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

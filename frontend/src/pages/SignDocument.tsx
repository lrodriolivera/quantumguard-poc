import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenTool, Shield, CheckCircle, FileText, Clock, Globe, Layers } from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';
import type { SignatureCountry } from '../types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  FileUpload,
  Alert,
  Spinner,
} from '../components/ui';

const ALGORITHMS = [
  // ML-DSA (Dilithium) - FIPS 204 - Lattice-based
  {
    id: 'ML-DSA-44',
    name: 'ML-DSA-44 (Dilithium2)',
    description: 'Nivel 2 - Recomendado para uso general',
    level: 2,
    family: 'ML-DSA',
    signatureSize: '2.4 KB',
  },
  {
    id: 'ML-DSA-65',
    name: 'ML-DSA-65 (Dilithium3)',
    description: 'Nivel 3 - Para documentos sensibles',
    level: 3,
    family: 'ML-DSA',
    signatureSize: '3.2 KB',
  },
  {
    id: 'ML-DSA-87',
    name: 'ML-DSA-87 (Dilithium5)',
    description: 'Nivel 5 - Maxima proteccion lattice',
    level: 5,
    family: 'ML-DSA',
    signatureSize: '4.5 KB',
  },
  // SLH-DSA (SPHINCS+) - FIPS 205 - Hash-based
  {
    id: 'SLH-DSA-SHA2-128s',
    name: 'SLH-DSA-SHA2-128s (SPHINCS+)',
    description: 'Nivel 1 - Firma basada en hashes',
    level: 1,
    family: 'SLH-DSA',
    signatureSize: '7.7 KB',
  },
  {
    id: 'SLH-DSA-SHA2-192s',
    name: 'SLH-DSA-SHA2-192s (SPHINCS+)',
    description: 'Nivel 3 - Firma hash-based, alta seguridad',
    level: 3,
    family: 'SLH-DSA',
    signatureSize: '15.8 KB',
  },
  {
    id: 'SLH-DSA-SHA2-256s',
    name: 'SLH-DSA-SHA2-256s (SPHINCS+)',
    description: 'Nivel 5 - Maxima proteccion hash-based',
    level: 5,
    family: 'SLH-DSA',
    signatureSize: '29.1 KB',
  },
];

const COUNTRIES: { code: SignatureCountry; name: string; ca: string }[] = [
  { code: 'CL', name: 'Chile', ca: 'QuantumGuard CA Chile' },
  { code: 'CO', name: 'Colombia', ca: 'QuantumGuard CA Colombia' },
  { code: 'ES', name: 'España', ca: 'QuantumGuard CA España' },
];

export default function SignDocument() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState(ALGORITHMS[0].id);
  const [country, setCountry] = useState<SignatureCountry>('CL');
  const [hybrid, setHybrid] = useState(true);
  const [step, setStep] = useState<'upload' | 'signing' | 'complete'>('upload');
  const [signatureResult, setSignatureResult] = useState<{
    documentId: string;
    signedAt: string;
    algorithm: string;
  } | null>(null);

  const { uploadDocument, signDocument, isLoading, error, clearError } = useDocuments();
  const navigate = useNavigate();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    clearError();
  };

  const handleSign = async () => {
    if (!selectedFile) return;

    setStep('signing');
    clearError();

    try {
      // First upload the document
      const uploadResult = await uploadDocument(selectedFile);

      // Then sign it (pass file for crypto signing)
      const signResult = await signDocument(uploadResult.id, selectedFile, selectedAlgorithm, { country, hybrid });

      setSignatureResult({
        documentId: uploadResult.id,
        signedAt: signResult.signature?.timestamp || signResult.signature?.created_at || new Date().toISOString(),
        algorithm: selectedAlgorithm,
      });
      setStep('complete');
    } catch {
      setStep('upload');
    }
  };

  const handleViewDocument = () => {
    if (signatureResult) {
      navigate(`/documents/${signatureResult.documentId}`);
    }
  };

  const handleSignAnother = () => {
    setSelectedFile(null);
    setSignatureResult(null);
    setStep('upload');
    clearError();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <PenTool className="w-8 h-8 text-quantum-600" />
          <h1 className="text-3xl font-bold text-gray-900">Firmar Documento</h1>
        </div>
        <p className="text-gray-600">
          Firma tus documentos con tecnologia criptografica post-cuantica.
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Selecciona el documento</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileSelect={handleFileSelect}
                accept=".pdf,.doc,.docx,.txt"
                maxSize={10 * 1024 * 1024}
              />
              <p className="text-sm text-gray-500 mt-2">
                Los PDF reciben además una copia con las firmas y el sello de tiempo embebidos.
              </p>
            </CardContent>
          </Card>

          {selectedFile && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>2. Selecciona el algoritmo de firma</CardTitle>
                </CardHeader>
                <CardContent className="py-0">
                  {/* ML-DSA (Lattice-based) */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ML-DSA — Lattice (FIPS 204)</p>
                  <div className="space-y-3 mb-5">
                    {ALGORITHMS.filter(a => a.family === 'ML-DSA').map((algo) => (
                      <label
                        key={algo.id}
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                          selectedAlgorithm === algo.id
                            ? 'border-quantum-500 bg-quantum-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="algorithm"
                          value={algo.id}
                          checked={selectedAlgorithm === algo.id}
                          onChange={(e) => setSelectedAlgorithm(e.target.value)}
                          className="sr-only"
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="font-medium text-gray-900">{algo.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              algo.level <= 2 ? 'bg-green-100 text-green-700'
                              : algo.level === 3 ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                            }`}>Nivel {algo.level}</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              {algo.signatureSize}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{algo.description}</p>
                        </div>
                        <Shield className={`w-6 h-6 ${selectedAlgorithm === algo.id ? 'text-quantum-600' : 'text-gray-300'}`} />
                      </label>
                    ))}
                  </div>

                  {/* SLH-DSA (Hash-based) */}
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">SLH-DSA — Hash-based (FIPS 205)</p>
                  <div className="space-y-3">
                    {ALGORITHMS.filter(a => a.family === 'SLH-DSA').map((algo) => (
                      <label
                        key={algo.id}
                        className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                          selectedAlgorithm === algo.id
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="algorithm"
                          value={algo.id}
                          checked={selectedAlgorithm === algo.id}
                          onChange={(e) => setSelectedAlgorithm(e.target.value)}
                          className="sr-only"
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="font-medium text-gray-900">{algo.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              algo.level <= 2 ? 'bg-green-100 text-green-700'
                              : algo.level === 3 ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                            }`}>Nivel {algo.level}</span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              {algo.signatureSize}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">{algo.description}</p>
                        </div>
                        <Shield className={`w-6 h-6 ${selectedAlgorithm === algo.id ? 'text-amber-600' : 'text-gray-300'}`} />
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>3. Jurisdicción y modo de firma</CardTitle>
                </CardHeader>
                <CardContent className="py-0 space-y-5">
                  <fieldset>
                    <legend className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
                      <Globe className="w-4 h-4 mr-1" /> País del certificado
                    </legend>
                    <div className="grid grid-cols-3 gap-3">
                      {COUNTRIES.map((c) => (
                        <label
                          key={c.code}
                          className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-quantum-400 ${
                            country === c.code
                              ? 'border-quantum-500 bg-quantum-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="country"
                            value={c.code}
                            checked={country === c.code}
                            onChange={() => setCountry(c.code)}
                            className="sr-only"
                          />
                          <span className="block font-semibold text-gray-900">{c.name}</span>
                          <span className="block text-xs text-gray-500 mt-1">{c.ca}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="flex items-start space-x-3 cursor-pointer rounded-xl border border-gray-200 p-4 hover:border-gray-300">
                    <input
                      type="checkbox"
                      checked={hybrid}
                      onChange={(e) => setHybrid(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-quantum-600 focus:ring-quantum-500"
                    />
                    <span>
                      <span className="flex items-center font-medium text-gray-900">
                        <Layers className="w-4 h-4 mr-1 text-quantum-600" /> Firma híbrida (recomendada)
                      </span>
                      <span className="block text-sm text-gray-500 mt-1">
                        Añade una firma clásica ECDSA P-256 junto a la post-cuántica. Ambas deben verificar,
                        así la firma resiste aunque uno de los dos algoritmos llegara a romperse.
                      </span>
                    </span>
                  </label>
                </CardContent>
              </Card>

              <Button
                onClick={handleSign}
                className="w-full"
                size="lg"
                isLoading={isLoading}
                leftIcon={<PenTool className="w-5 h-5" />}
              >
                Firmar Documento
              </Button>
            </>
          )}
        </div>
      )}

      {/* Signing Step */}
      {step === 'signing' && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <Spinner size="lg" className="mx-auto mb-6" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Firmando documento...
              </h3>
              <p className="text-gray-600 mb-4">
                Aplicando firma post-cuantica con {selectedAlgorithm}
              </p>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>Esto tomara solo unos segundos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Complete Step */}
      {step === 'complete' && signatureResult && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Documento Firmado Exitosamente
              </h3>
              <p className="text-gray-600 mb-6">
                Tu documento ha sido firmado con tecnologia post-cuantica.
              </p>

              {/* Signature Details */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left max-w-sm mx-auto">
                <h4 className="font-medium text-gray-900 mb-4">Detalles de la firma:</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Archivo:</span>
                    <span className="font-medium text-gray-900 flex items-center">
                      <FileText className="w-4 h-4 mr-1" />
                      {selectedFile?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Algoritmo:</span>
                    <span className="font-medium text-quantum-600">
                      {signatureResult.algorithm}{hybrid ? ' + ECDSA P-256' : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">CA emisora:</span>
                    <span className="font-medium text-gray-900">
                      {COUNTRIES.find((c) => c.code === country)?.ca}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Fecha:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(signatureResult.signedAt).toLocaleString('es-ES')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Estado:</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Quantum-Safe
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Certificado:</span>
                    <span className="text-xs font-medium text-quantum-600">X.509 (RFC 9881)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Firma CMS:</span>
                    <span className="text-xs font-medium text-quantum-600">PKCS#7 (RFC 9882)</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleViewDocument} variant="primary">
                  Ver Documento
                </Button>
                <Button onClick={handleSignAnother} variant="outline">
                  Firmar Otro
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

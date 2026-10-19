import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PenTool, Shield, CheckCircle, FileText, Clock, Globe, Layers, Users, Plus, X, Mail } from 'lucide-react';
import { useDocuments } from '../hooks/useDocuments';
import { envelopeService } from '../services/envelope.service';
import type { SignatureCountry, Envelope, EnvelopeSignerInput } from '../types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  FileUpload,
  Alert,
  Spinner,
  Input,
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
  const [signerMode, setSignerMode] = useState<'self' | 'invite'>('self');
  const [signers, setSigners] = useState<EnvelopeSignerInput[]>([{ name: '', email: '', phone: '' }]);
  const [sequential, setSequential] = useState(false);
  const [step, setStep] = useState<'upload' | 'signing' | 'complete' | 'sent'>('upload');
  const [signatureResult, setSignatureResult] = useState<{
    documentId: string;
    signedAt: string;
    algorithm: string;
  } | null>(null);
  const [sentEnvelope, setSentEnvelope] = useState<Envelope | null>(null);
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);

  const { uploadDocument, signDocument, isLoading, error, clearError } = useDocuments();
  const navigate = useNavigate();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    clearError();
  };

  const validSigners = signers
    .map((s) => ({ name: s.name.trim(), email: s.email.trim(), phone: s.phone?.trim() || undefined }))
    .filter((s) => s.name && s.email);
  const canInvite = signerMode === 'self' || validSigners.length > 0;

  const addSignerRow = () => setSigners((rows) => [...rows, { name: '', email: '', phone: '' }]);
  const removeSignerRow = (index: number) =>
    setSigners((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows));
  const updateSignerRow = (index: number, patch: Partial<EnvelopeSignerInput>) =>
    setSigners((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const handleSign = async () => {
    if (!selectedFile) return;

    setStep('signing');
    clearError();
    setEnvelopeError(null);

    try {
      const uploadResult = await uploadDocument(selectedFile);

      if (signerMode === 'invite') {
        const envelope = await envelopeService.createEnvelope({
          document_id: uploadResult.id,
          mode: sequential ? 'sequential' : 'parallel',
          country,
          algorithm: selectedAlgorithm,
          hybrid,
          signers: validSigners,
        });
        setSentEnvelope(envelope);
        setStep('sent');
        return;
      }

      const signResult = await signDocument(uploadResult.id, selectedFile, selectedAlgorithm, { country, hybrid });

      setSignatureResult({
        documentId: uploadResult.id,
        signedAt: signResult.signature?.timestamp || signResult.signature?.created_at || new Date().toISOString(),
        algorithm: selectedAlgorithm,
      });
      setStep('complete');
    } catch (err) {
      if (signerMode === 'invite') {
        const anyErr = err as { response?: { data?: { message?: string } } };
        setEnvelopeError(anyErr.response?.data?.message || 'No se pudo crear la solicitud de firma');
      }
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
    setSentEnvelope(null);
    setSignerMode('self');
    setSigners([{ name: '', email: '', phone: '' }]);
    setSequential(false);
    setEnvelopeError(null);
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

              <Card>
                <CardHeader>
                  <CardTitle>4. ¿Quién firma?</CardTitle>
                </CardHeader>
                <CardContent className="py-0 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSignerMode('self')}
                      className={`rounded-xl border-2 p-4 text-left transition-colors ${
                        signerMode === 'self' ? 'border-quantum-500 bg-quantum-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center font-semibold text-gray-900">
                        <PenTool className="w-4 h-4 mr-1.5" /> Solo yo
                      </span>
                      <span className="block text-sm text-gray-500 mt-1">Firmas tu propio documento ahora mismo.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignerMode('invite')}
                      className={`rounded-xl border-2 p-4 text-left transition-colors ${
                        signerMode === 'invite' ? 'border-quantum-500 bg-quantum-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center font-semibold text-gray-900">
                        <Users className="w-4 h-4 mr-1.5" /> Invitar a otras personas
                      </span>
                      <span className="block text-sm text-gray-500 mt-1">
                        Les llega un enlace por correo; firman sin crear cuenta.
                      </span>
                    </button>
                  </div>

                  {signerMode === 'invite' && (
                    <div className="space-y-4 pt-2">
                      {envelopeError && (
                        <Alert variant="error" onClose={() => setEnvelopeError(null)}>
                          {envelopeError}
                        </Alert>
                      )}
                      <div className="space-y-3">
                        {signers.map((signer, index) => (
                          <div key={index} className="flex gap-2 items-start bg-gray-50 rounded-xl p-3">
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <Input
                                placeholder="Nombre completo"
                                value={signer.name}
                                onChange={(e) => updateSignerRow(index, { name: e.target.value })}
                              />
                              <Input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={signer.email}
                                onChange={(e) => updateSignerRow(index, { email: e.target.value })}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => removeSignerRow(index)}
                              className="p-2 text-gray-400 hover:text-red-500"
                              aria-label="Quitar firmante"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" onClick={addSignerRow} leftIcon={<Plus className="w-4 h-4" />}>
                        Agregar otro firmante
                      </Button>

                      {validSigners.length > 1 && (
                        <label className="flex items-start space-x-3 cursor-pointer rounded-xl border border-gray-200 p-4 hover:border-gray-300">
                          <input
                            type="checkbox"
                            checked={sequential}
                            onChange={(e) => setSequential(e.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-quantum-600 focus:ring-quantum-500"
                          />
                          <span>
                            <span className="font-medium text-gray-900">Firma secuencial</span>
                            <span className="block text-sm text-gray-500 mt-1">
                              Cada firmante espera su turno en el orden indicado. Si lo dejas sin marcar, a todos
                              les llega la invitación al mismo tiempo.
                            </span>
                          </span>
                        </label>
                      )}

                      <p className="text-xs text-gray-500 flex items-center">
                        <Mail className="w-3.5 h-3.5 mr-1" /> Cada firmante confirma su identidad con un código
                        enviado a su correo antes de poder firmar.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button
                onClick={handleSign}
                className="w-full"
                size="lg"
                isLoading={isLoading}
                disabled={!canInvite}
                leftIcon={<PenTool className="w-5 h-5" />}
              >
                {signerMode === 'invite' ? 'Enviar solicitud de firma' : 'Firmar Documento'}
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

      {/* Sent Step: envelope created, waiting on external signers */}
      {step === 'sent' && sentEnvelope && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-quantum-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8 text-quantum-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Solicitud de firma enviada</h3>
              <p className="text-gray-600 mb-6">
                {sentEnvelope.mode === 'sequential'
                  ? 'Avisamos al primer firmante por correo. Los demás recibirán su turno en orden.'
                  : 'Avisamos a todos los firmantes por correo al mismo tiempo.'}
              </p>

              <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left max-w-sm mx-auto">
                <h4 className="font-medium text-gray-900 mb-4">Firmantes:</h4>
                <div className="space-y-3">
                  {sentEnvelope.signers
                    .slice()
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((signer) => (
                      <div key={signer.id} className="flex items-center justify-between">
                        <span className="text-gray-700">
                          {signer.name}
                          <span className="block text-xs text-gray-400">{signer.email}</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            signer.status === 'signed'
                              ? 'bg-green-100 text-green-700'
                              : signer.status === 'notified' || signer.status === 'viewed'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {signer.status === 'signed' ? 'Firmó' : signer.status === 'notified' ? 'Avisado' : signer.status === 'viewed' ? 'Abrió el enlace' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => navigate('/documents')} variant="primary">
                  Ver en Documentos
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

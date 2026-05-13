import { useState } from 'react';
import { Search, Shield, CheckCircle, XCircle, FileText, Clock, Hash } from 'lucide-react';
import { documentService } from '../services/document.service';
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
import type { VerificationResult } from '../types';

export default function VerifyDocument() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'verifying' | 'result'>('upload');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setError(null);
  };

  const handleVerify = async () => {
    if (!selectedFile) return;

    setStep('verifying');
    setError(null);

    try {
      const verificationResult = await documentService.verifyUploadedDocument(selectedFile);
      setResult(verificationResult);
      setStep('result');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error al verificar el documento. Intenta de nuevo.'
      );
      setStep('upload');
    }
  };

  const handleVerifyAnother = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setStep('upload');
  };

  const isValid = result?.data?.valid;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Search className="w-8 h-8 text-green-600" />
          <h1 className="text-3xl font-bold text-gray-900">Verificar Firma</h1>
        </div>
        <p className="text-gray-600">
          Verifica la autenticidad de documentos firmados con QuantumGuard.
        </p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Upload Step */}
      {step === 'upload' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sube el documento firmado</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                onFileSelect={handleFileSelect}
                accept=".pdf,.doc,.docx,.txt"
                maxSize={10 * 1024 * 1024}
              />
            </CardContent>
          </Card>

          {selectedFile && (
            <Button
              onClick={handleVerify}
              className="w-full"
              size="lg"
              leftIcon={<Search className="w-5 h-5" />}
            >
              Verificar Firma
            </Button>
          )}

          {/* Info Card */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent>
              <div className="flex space-x-4">
                <Shield className="w-8 h-8 text-blue-600 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-blue-900 mb-1">
                    Como funciona la verificacion
                  </h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>1. Extraemos la firma digital del documento</li>
                    <li>2. Verificamos la firma con el algoritmo post-cuantico</li>
                    <li>3. Confirmamos la integridad del documento</li>
                    <li>4. Mostramos los detalles de la verificacion</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Verifying Step */}
      {step === 'verifying' && (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <Spinner size="lg" className="mx-auto mb-6" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Verificando firma...
              </h3>
              <p className="text-gray-600 mb-4">
                Analizando el documento y validando la firma criptografica
              </p>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>Esto tomara solo unos segundos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result Step */}
      {step === 'result' && result && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              {/* Result Icon */}
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  isValid ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                {isValid ? (
                  <CheckCircle className="w-10 h-10 text-green-600" />
                ) : (
                  <XCircle className="w-10 h-10 text-red-600" />
                )}
              </div>

              {/* Result Title */}
              <h3
                className={`text-2xl font-bold mb-2 ${
                  isValid ? 'text-green-700' : 'text-red-700'
                }`}
              >
                {isValid ? 'Firma Valida' : 'Firma Invalida'}
              </h3>
              <p className="text-gray-600 mb-6">
                {isValid
                  ? 'El documento tiene una firma post-cuantica valida y no ha sido modificado.'
                  : 'No se pudo verificar la firma del documento o ha sido alterado.'}
              </p>

              {/* Verification Details */}
              {result.data && (
                <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left max-w-md mx-auto">
                  <h4 className="font-medium text-gray-900 mb-4">
                    Detalles de verificacion:
                  </h4>
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
                        {result.data.algorithm}
                      </span>
                    </div>
                    {result.data.signedAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500">Firmado:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(result.data.signedAt).toLocaleString('es-ES')}
                        </span>
                      </div>
                    )}
                    {result.data.details?.documentHash && (
                      <div className="flex items-start justify-between">
                        <span className="text-gray-500">Hash:</span>
                        <span className="font-mono text-xs text-gray-700 break-all max-w-[200px] flex items-center">
                          <Hash className="w-3 h-3 mr-1 flex-shrink-0" />
                          {result.data.details.documentHash.slice(0, 16)}...
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Quantum-Safe:</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          result.data.details?.quantumSafe
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {result.data.details?.quantumSafe ? 'Si' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleVerifyAnother} variant="primary">
                Verificar Otro Documento
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

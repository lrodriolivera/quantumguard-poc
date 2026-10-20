import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Shield, CheckCircle, XCircle, FileText } from 'lucide-react';
import { documentService } from '../services/document.service';
import { Card, CardContent, CardHeader, CardTitle, Spinner } from '../components/ui';
import type { VerificationResult } from '../types';

type Step = 'loading' | 'error' | 'result';

export default function VerifyQR() {
  const { signatureId = '' } = useParams<{ signatureId: string }>();
  const [searchParams] = useSearchParams();
  const hash = searchParams.get('hash') || '';
  const [step, setStep] = useState<Step>('loading');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    documentService
      .verifyBySignatureId(signatureId, hash)
      .then((data) => {
        if (!active) return;
        setResult(data);
        setStep('result');
      })
      .catch((err) => {
        if (!active) return;
        const anyErr = err as { response?: { data?: { message?: string } } };
        setErrorMessage(anyErr.response?.data?.message || 'No se pudo verificar esta firma.');
        setStep('error');
      });
    return () => {
      active = false;
    };
  }, [signatureId, hash]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center space-x-3 mb-6">
        <Shield className="w-7 h-7 text-quantum-600" />
        <span className="text-lg font-bold text-gray-900">QuantumGuard</span>
      </div>

      {step === 'loading' && (
        <Card>
          <CardContent>
            <div className="py-16 flex flex-col items-center text-gray-500">
              <Spinner size="lg" className="mb-4" />
              Verificando firma…
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'error' && (
        <Card>
          <CardContent>
            <div className="py-10 text-center">
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                No se pudo verificar esta firma
              </h2>
              <p className="text-gray-600">{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'result' && result && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado de verificación</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="py-6 text-center">
              {result.valid ? (
                <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
              ) : (
                <XCircle className="w-14 h-14 text-red-500 mx-auto mb-4" />
              )}
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                {result.valid ? 'Firma válida' : 'Firma no válida'}
              </h2>
              {result.reason && <p className="text-gray-600 text-sm mb-4">{result.reason}</p>}
            </div>

            {result.filename && (
              <div className="flex items-center text-sm text-gray-700 mb-4">
                <FileText className="w-4 h-4 mr-2 text-gray-400" />
                <span className="font-medium">{result.filename}</span>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
              <p>
                Algoritmo: <span className="font-medium text-gray-900">{result.algorithm}</span>
              </p>
              {result.signed_at && (
                <p>
                  Firmado: <span className="font-medium text-gray-900">{result.signed_at}</span>
                </p>
              )}
              <p>
                Post-cuántico:{' '}
                <span className="font-medium text-gray-900">
                  {result.quantum_safe ? 'Sí' : 'No'}
                </span>
              </p>
            </div>

            {result.signers && result.signers.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Firmantes:</p>
                {result.signers.map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p>{s.email}</p>
                    {s.algorithm && <p>{s.algorithm}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-gray-400 mt-6">
        Verificación de firma QuantumGuard — Postcuantica
      </p>
    </div>
  );
}

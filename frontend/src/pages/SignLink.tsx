import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, Mail, CheckCircle, XCircle, FileText, Clock } from 'lucide-react';
import { signLinkService } from '../services/envelope.service';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Alert, Spinner } from '../components/ui';
import type { PublicSignerInfo } from '../types';

type Step = 'loading' | 'error' | 'otp' | 'confirm' | 'signed' | 'declined';

export default function SignLink() {
  const { token = '' } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<PublicSignerInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    let active = true;
    signLinkService
      .getSigner(token)
      .then((data) => {
        if (!active) return;
        setInfo(data);
        if (data.signer.status === 'signed') {
          setStep('signed');
        } else {
          setStep('otp');
        }
      })
      .catch((err) => {
        if (!active) return;
        setErrorMessage(describeLinkError(err));
        setStep('error');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSendOtp = async () => {
    setSending(true);
    setErrorMessage(null);
    try {
      await signLinkService.requestOtp(token);
      setOtpSent(true);
    } catch (err) {
      setErrorMessage(describeLinkError(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (code.trim().length !== 6) {
      setErrorMessage('El código tiene 6 dígitos');
      return;
    }
    setVerifying(true);
    setErrorMessage(null);
    try {
      await signLinkService.verifyOtp(token, code.trim());
      setStep('confirm');
    } catch (err) {
      setErrorMessage(describeLinkError(err));
    } finally {
      setVerifying(false);
    }
  };

  const handleSign = async () => {
    setSigning(true);
    setErrorMessage(null);
    try {
      await signLinkService.sign(token);
      setStep('signed');
    } catch (err) {
      setErrorMessage(describeLinkError(err));
    } finally {
      setSigning(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    setErrorMessage(null);
    try {
      await signLinkService.decline(token);
      setStep('declined');
    } catch (err) {
      setErrorMessage(describeLinkError(err));
    } finally {
      setDeclining(false);
    }
  };

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
              Cargando tu solicitud de firma…
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
                No se pudo abrir este enlace
              </h2>
              <p className="text-gray-600">{errorMessage}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {info && (step === 'otp' || step === 'confirm') && (
        <Card>
          <CardHeader>
            <CardTitle>Firmar documento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex items-center text-sm text-gray-700">
                <FileText className="w-4 h-4 mr-2 text-gray-400" />
                <span className="font-medium">{info.document.filename}</span>
              </div>
              <p className="text-sm text-gray-500">
                {info.owner_name} te invitó a firmar este documento.
              </p>
              <p className="text-sm text-gray-500">
                Firmando como <span className="font-medium text-gray-700">{info.signer.name}</span>{' '}
                ({info.signer.email})
              </p>
            </div>

            {errorMessage && (
              <Alert variant="error" onClose={() => setErrorMessage(null)}>
                {errorMessage}
              </Alert>
            )}

            {step === 'otp' && !otpSent && (
              <div className="text-center py-4">
                <Mail className="w-10 h-10 text-quantum-500 mx-auto mb-3" />
                <p className="text-gray-600 mb-5 text-sm">
                  Te enviaremos un código a <strong>{info.signer.email}</strong> para confirmar tu identidad.
                </p>
                <Button onClick={handleSendOtp} isLoading={sending} className="w-full">
                  Enviar código por correo
                </Button>
              </div>
            )}

            {step === 'otp' && otpSent && (
              <div className="py-2">
                <p className="text-sm text-gray-600 mb-3">
                  Revisa tu correo e ingresa el código de 6 dígitos.
                </p>
                <Input
                  label="Código de verificación"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-widest"
                />
                <div className="flex gap-3 mt-4">
                  <Button
                    variant="outline"
                    onClick={handleSendOtp}
                    isLoading={sending}
                    disabled={verifying}
                  >
                    Reenviar código
                  </Button>
                  <Button onClick={handleVerifyOtp} isLoading={verifying} className="flex-1">
                    Verificar
                  </Button>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="py-2">
                <Alert variant="success">Identidad verificada</Alert>
                <p className="text-sm text-gray-600 my-4">
                  Al firmar, confirmas que leíste el documento y aceptas su contenido. Esta firma queda
                  respaldada con criptografía post-cuántica y un sello de tiempo certificado
                  {info.envelope.mode === 'sequential' ? '.' : ', junto con la de los demás firmantes.'}
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" onClick={handleDecline} isLoading={declining}>
                    No voy a firmar
                  </Button>
                  <Button onClick={handleSign} isLoading={signing} className="flex-1">
                    Firmar documento
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 'signed' && (
        <Card>
          <CardContent>
            <div className="py-10 text-center">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Documento firmado</h2>
              <p className="text-gray-600 text-sm">
                Tu firma quedó registrada con QuantumGuard. Ya puedes cerrar esta página.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'declined' && (
        <Card>
          <CardContent>
            <div className="py-10 text-center">
              <Clock className="w-14 h-14 text-gray-400 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Firma rechazada</h2>
              <p className="text-gray-600 text-sm">
                Avisamos a quien te invitó que decidiste no firmar este documento.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-gray-400 mt-6">
        Firma electrónica respaldada por QuantumGuard — Postcuantica
      </p>
    </div>
  );
}

function describeLinkError(err: unknown): string {
  const anyErr = err as { response?: { status?: number; data?: { message?: string } } };
  const status = anyErr.response?.status;
  const message = anyErr.response?.data?.message;
  if (status === 404) return 'Este enlace no es válido.';
  if (status === 410) return message || 'Este enlace ya no está disponible.';
  if (status === 409) return message || 'Esta acción ya se completó.';
  if (status === 429) return message || 'Demasiados intentos. Espera un momento.';
  return message || 'Ocurrió un error. Inténtalo de nuevo.';
}

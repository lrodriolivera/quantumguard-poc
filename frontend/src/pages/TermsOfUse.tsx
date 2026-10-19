import { Link } from 'react-router-dom';
import { FileWarning } from 'lucide-react';

const LAST_UPDATED = '20 de octubre de 2026';

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Uso</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED}</p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Qué es QuantumGuard</h2>
          <p className="text-gray-700 leading-relaxed">
            QuantumGuard es una plataforma de firma electrónica que permite firmar y verificar
            documentos digitalmente. Ofrecemos dos modalidades de firma con distinto valor
            jurídico y nivel de verificación de identidad:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
            <li>
              <strong>Firma simple:</strong> consentimiento expreso registrado mediante
              verificación del correo electrónico del firmante (código de un solo uso, OTP) y
              trazabilidad (IP, fecha/hora, hash del documento). Equivalente funcional a un
              "acepto" con evidencia verificable, pensado para contratos, acuerdos comerciales,
              cotizaciones, políticas internas y documentos donde la ley no exige una formalidad
              reforzada.
            </li>
            <li>
              <strong>Firma avanzada / criptográfica post-cuántica:</strong> firma digital
              generada con algoritmos ML-DSA (Dilithium) e híbridos ML-DSA+ECDSA, con certificado
              emitido por la jerarquía de Autoridad Certificadora de QuantumGuard, sello de tiempo
              (RFC 3161) y verificación criptográfica de integridad.
            </li>
          </ul>
        </section>

        <section className="mb-10 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <FileWarning className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-amber-900 mb-2">
                2. Qué NO puedes firmar con firma simple
              </h2>
              <p className="text-amber-900 leading-relaxed mb-3">
                La ley exige firma ante notario, escritura pública u otra formalidad reforzada
                para ciertos actos. QuantumGuard no sustituye esos requisitos. A título
                orientativo (no exhaustivo, y sujeto a la legislación vigente de cada país), NO
                debes usar la firma simple de QuantumGuard para:
              </p>
              <ul className="list-disc pl-6 space-y-1 text-amber-900">
                <li>Testamentos y actos de última voluntad.</li>
                <li>Compraventa, hipoteca o constitución de gravámenes sobre bienes inmuebles.</li>
                <li>Constitución o modificación de sociedades que exija escritura pública.</li>
                <li>Actos del estado civil (matrimonio, reconocimiento de hijos, divorcio).</li>
                <li>Poderes que la ley exija otorgar ante notario.</li>
                <li>Pagarés, letras de cambio y otros títulos valores con requisitos formales propios.</li>
                <li>
                  Cualquier acto para el cual la legislación aplicable exija expresamente firma
                  ante fedatario público, escritura pública o un nivel de firma electrónica
                  calificada/avanzada específico.
                </li>
              </ul>
              <p className="text-amber-900 leading-relaxed mt-3">
                Si tienes dudas sobre si un documento puede firmarse con firma simple, consulta
                con un abogado antes de usarlo para ese fin. QuantumGuard no brinda asesoría
                legal.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Marco legal — Chile</h2>
          <p className="text-gray-700 leading-relaxed">
            En Chile, la Ley N.° 19.799 sobre documentos electrónicos y firma electrónica
            reconoce la firma electrónica simple y la firma electrónica avanzada. La firma simple
            tiene valor probatorio y se admite como prueba en juicio conforme a las reglas
            generales; la firma avanzada (certificada por un prestador acreditado ante la
            Subsecretaría de Economía) equivale a la firma manuscrita para la generalidad de los
            actos, salvo las excepciones legales.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Marco legal — Colombia</h2>
          <p className="text-gray-700 leading-relaxed">
            En Colombia, la Ley 527 de 1999 y su reglamentación (Decreto 2364 de 2012, Decreto
            333 de 2014) distinguen entre firma electrónica (incluida la firma simple) y firma
            digital, esta última basada en una infraestructura de clave pública (PKI) certificada
            por una Entidad de Certificación Digital (ECD) acreditada ante el ONAC. La firma
            digital goza de la presunción legal de equivalencia con la firma manuscrita; la firma
            electrónica simple es admisible como medio de prueba y su valor depende de la
            fiabilidad del método usado para identificar al firmante y vincular su consentimiento
            al contenido del documento.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Responsabilidad del usuario</h2>
          <p className="text-gray-700 leading-relaxed">
            Al usar QuantumGuard, declaras que la información que proporcionas (identidad, correo
            electrónico, documentos) es veraz, y que tienes la facultad legal para firmar o
            solicitar la firma de los documentos que subes a la plataforma. Eres responsable de
            elegir la modalidad de firma adecuada para cada documento.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Disponibilidad y limitación de responsabilidad</h2>
          <p className="text-gray-700 leading-relaxed">
            El servicio se ofrece "tal cual". No garantizamos disponibilidad ininterrumpida.
            QuantumGuard no es responsable por el uso de documentos firmados fuera del alcance
            legal de cada modalidad de firma descrita en estos Términos.
          </p>
        </section>

        <p className="text-sm text-gray-500">
          Ver también nuestra{' '}
          <Link to="/privacidad" className="text-quantum-600 hover:underline">
            Política de Privacidad
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

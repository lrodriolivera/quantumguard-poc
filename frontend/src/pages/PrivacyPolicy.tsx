import { Link } from 'react-router-dom';

const LAST_UPDATED = '20 de octubre de 2026';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-10">Última actualización: {LAST_UPDATED}</p>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Datos que recopilamos</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Datos de cuenta: nombre, correo electrónico, contraseña (almacenada con hash).</li>
            <li>Documentos que subes para firmar o verificar.</li>
            <li>
              Datos de firmantes invitados: correo electrónico, código OTP (almacenado con hash,
              nunca en texto plano), dirección IP y user-agent al momento de firmar, como
              evidencia de consentimiento.
            </li>
            <li>Metadatos de uso: fecha/hora de firma, estado de documentos y envíos.</li>
            <li>Datos de facturación, cuando corresponda (procesados por nuestro proveedor de pagos, no almacenamos números de tarjeta).</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Para qué usamos tus datos</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700">
            <li>Prestar el servicio de firma y verificación de documentos.</li>
            <li>Enviar invitaciones de firma y códigos de verificación por correo electrónico.</li>
            <li>Generar evidencia de auditoría (quién firmó, cuándo, desde dónde) para sustentar el valor probatorio de la firma simple.</li>
            <li>Cumplir obligaciones legales y responder requerimientos de autoridad competente.</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Con quién compartimos datos</h2>
          <p className="text-gray-700 leading-relaxed">
            No vendemos tus datos. Los compartimos únicamente con proveedores que nos permiten
            operar el servicio (envío de correo transaccional para invitaciones y OTP,
            procesamiento de pagos), bajo acuerdos de confidencialidad, y solo en la medida
            necesaria para prestar esas funciones.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Chile — Ley 19.628</h2>
          <p className="text-gray-700 leading-relaxed">
            Tratamos los datos personales de usuarios en Chile conforme a la Ley N.° 19.628 sobre
            Protección de la Vida Privada. Puedes ejercer tus derechos de acceso, rectificación,
            cancelación y oposición escribiendo a los canales de contacto de soporte.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Colombia — Ley 1581 de 2012 (Habeas Data)</h2>
          <p className="text-gray-700 leading-relaxed">
            Tratamos los datos personales de usuarios en Colombia conforme a la Ley 1581 de 2012
            y sus decretos reglamentarios. Como Responsable del Tratamiento, recolectamos tus
            datos con tu autorización previa, expresa e informada al crear una cuenta o al recibir
            una invitación de firma. Tienes derecho a conocer, actualizar, rectificar y suprimir
            tus datos, y a revocar la autorización otorgada, mediante solicitud a nuestros canales
            de contacto. Si el volumen de datos que tratamos supera el umbral que exige registro
            ante el Registro Nacional de Bases de Datos (RNBD), cumpliremos con dicho registro.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Retención y seguridad</h2>
          <p className="text-gray-700 leading-relaxed">
            Conservamos los documentos firmados y su evidencia de auditoría mientras tu cuenta
            esté activa y durante el plazo necesario para sustentar su valor probatorio.
            Protegemos los datos con cifrado en tránsito y en reposo, y con los controles de
            acceso descritos en nuestra arquitectura de firma post-cuántica.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Tus derechos</h2>
          <p className="text-gray-700 leading-relaxed">
            Puedes solicitar acceso, corrección o eliminación de tus datos personales, salvo que
            exista una obligación legal de conservarlos (por ejemplo, evidencia de firmas ya
            emitidas). Para ejercer estos derechos, contáctanos a través de los canales indicados
            en la plataforma.
          </p>
        </section>

        <p className="text-sm text-gray-500">
          Ver también nuestros{' '}
          <Link to="/terminos" className="text-quantum-600 hover:underline">
            Términos de Uso
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

# QuantumGuard AI - Script de Demo (15 minutos)

## Preparacion (antes del demo)

1. Asegurar que todos los servicios esten corriendo:
   ```bash
   ./scripts/health-check.sh
   ```

2. Abrir en el navegador:
   - Frontend: http://localhost:3000
   - Crypto API Docs: http://localhost:8001/docs

3. Tener listos los documentos de ejemplo en `demo/documents/`

---

## Demo (15 minutos)

### 1. Introduccion (2 min)

**Hablar sobre:**
- "Las computadoras cuanticas amenazan la criptografia actual"
- "Algoritmos como RSA y ECDSA seran vulnerables en 10-15 anos"
- "NIST ha certificado nuevos algoritmos post-cuanticos"
- "QuantumGuard implementa ML-DSA (Dilithium) - el nuevo estandar"

**Mostrar:** Landing page con features

---

### 2. Registro de Usuario (2 min)

1. Hacer clic en "Comenzar Gratis"
2. Completar formulario de registro:
   - Nombre: Demo Usuario
   - Email: demo@quantumguard.ai
   - Password: Demo123!
3. Mostrar que el registro es instantaneo
4. Redireccion automatica al Dashboard

---

### 3. Dashboard (2 min)

**Mostrar:**
- Estadisticas de documentos (inicialmente 0)
- Tarjetas de acciones rapidas
- Diseño limpio y profesional

**Hablar sobre:**
- "Interfaz intuitiva, no requiere conocimiento tecnico"
- "Todo el proceso es transparente para el usuario"

---

### 4. Firmar un Documento (4 min)

1. Hacer clic en "Firmar Documento"
2. Subir documento de ejemplo (`demo/documents/contrato_ejemplo.txt`)
3. Seleccionar algoritmo:
   - **ML-DSA-44** - Para uso general (recomendado)
   - Explicar niveles de seguridad (2, 3, 5)
4. Hacer clic en "Firmar Documento"
5. Mostrar animacion de firma
6. Mostrar resultado:
   - Firma completada en < 1 segundo
   - Detalles: algoritmo, timestamp, estado quantum-safe

**Puntos clave:**
- "2,600+ firmas por segundo"
- "Firma valida por 50+ anos"
- "Resistente a computadoras cuanticas"

---

### 5. Verificar una Firma (3 min)

1. Ir a "Verificar Firma"
2. Subir el documento firmado
3. Mostrar resultado de verificacion:
   - Indicador verde de firma valida
   - Detalles del algoritmo usado
   - Hash del documento
   - Estado quantum-safe

**Hablar sobre:**
- "Cualquier persona puede verificar la autenticidad"
- "No se necesita la clave privada para verificar"
- "Deteccion de documentos alterados"

---

### 6. Lista de Documentos (1 min)

1. Ir a "Mis Documentos"
2. Mostrar filtros por estado
3. Mostrar acciones: ver, descargar, eliminar

---

### 7. Cierre Tecnico (1 min)

**Mostrar API Docs:** http://localhost:8001/docs

- Endpoints disponibles
- Algoritmos soportados
- Integracion via REST API

**Mencionar:**
- "API lista para integracion empresarial"
- "Cumple con estandares NIST FIPS 204"
- "Open source (liboqs)"

---

## Preguntas y Respuestas

**Preguntas frecuentes:**

1. **"Es seguro?"**
   - Certificado por NIST
   - Mismo nivel de seguridad que bancos
   - Resistente a ataques cuanticos

2. **"Que tan rapido es?"**
   - 2,600 firmas por segundo
   - Verificacion en < 1ms

3. **"Puedo integrarlo con mi sistema?"**
   - API REST disponible
   - SDKs en desarrollo
   - Documentacion completa

4. **"Cual es el costo?"**
   - POC gratuito
   - Planes empresariales disponibles

---

## Documentos de Ejemplo

Usar los documentos en `demo/documents/`:
- `contrato_ejemplo.txt` - Contrato simple
- `factura_ejemplo.txt` - Factura comercial
- `acuerdo_confidencialidad.txt` - NDA

---

## Contacto Post-Demo

- Email: info@rypcloud.com
- Web: quantumguard.ai
- GitHub: github.com/rypcloud/quantumguard

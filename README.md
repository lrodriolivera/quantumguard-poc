<div align="center">

# QuantumGuard AI

**Sistema de Firmas Digitales Post-Cuánticas**

[![NIST FIPS 204](https://img.shields.io/badge/NIST-FIPS%20204-blue)](https://csrc.nist.gov/pubs/fips/204/final)
[![NIST FIPS 205](https://img.shields.io/badge/NIST-FIPS%20205-blue)](https://csrc.nist.gov/pubs/fips/205/final)
[![NIST FIPS 203](https://img.shields.io/badge/NIST-FIPS%20203-blue)](https://csrc.nist.gov/pubs/fips/203/final)
[![Live](https://img.shields.io/badge/Live-postcuantica.io-green)](https://postcuantica.io)

Plataforma de firma digital resistente a computadoras cuánticas. Implementa los estándares NIST post-cuánticos (ML-DSA, SLH-DSA, ML-KEM) con rendimiento de producción.

[Demo en vivo](https://postcuantica.io) | [Documentación API](#api-endpoints) | [Quick Start](#quick-start)

</div>

---

## Por qué existe esto

Los algoritmos de firma digital actuales (RSA, ECDSA) serán vulnerables cuando existan computadoras cuánticas suficientemente potentes. QuantumGuard implementa los nuevos estándares NIST post-cuánticos para proteger documentos **hoy** con criptografía que permanecerá segura **décadas**.

### Rendimiento real medido

| Operación | Latencia | Throughput |
|-----------|----------|------------|
| Generación keypair | 0.15ms | 6,634/seg |
| Firma de documento | 0.38ms | 2,661/seg |
| Verificación | 0.19ms | 5,136/seg |

### Algoritmos soportados

| Estándar | Algoritmo | Niveles de seguridad |
|----------|-----------|---------------------|
| FIPS 204 | ML-DSA (Dilithium) | 44, 65, 87 |
| FIPS 205 | SLH-DSA (SPHINCS+) | SHA2-128s, 192s, 256s |
| FIPS 203 | ML-KEM (Kyber) | 512, 768, 1024 |

## Arquitectura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│   Backend API   │────▶│ Crypto Service  │
│ React 19 + Vite│     │ Node.js/Express │     │ Python + liboqs │
│ Tailwind CSS v4│     │   TypeScript    │     │    FastAPI       │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │ PostgreSQL 15│          │   Redis 7    │
           │   (datos)    │          │ (cache/rate) │
           └──────────────┘          └──────────────┘
```

| Servicio | Puerto | Tecnología |
|----------|--------|------------|
| Frontend | 3000 (dev) / 80 (prod) | React 19 + Nginx |
| Backend | 5000 | Node.js + Express + TypeScript |
| Crypto Service | 8001 | Python 3.11 + FastAPI + liboqs |
| PostgreSQL | 5432 | postgres:15 |
| Redis | 6381 | redis:7-alpine |

## Quick Start

### Con Docker (recomendado)

```bash
git clone https://github.com/luisrodriguez-postcuantica/quantumguard-poc.git
cd quantumguard-poc
docker compose up -d
```

La aplicación estará disponible en `http://localhost:3000`

### Desarrollo local

```bash
# Base de datos
docker compose up -d postgres redis

# Crypto Service (Python)
cd crypto-service
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 &

# Backend (Node.js)
cd ../backend
npm install && npm run dev &

# Frontend (React)
cd ../frontend
npm install && npm run dev
```

### Variables de entorno

Copiar `.env.example` a `.env` en la raíz y en `backend/`:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

## API Endpoints

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar usuario |
| POST | `/api/auth/login` | Iniciar sesión |
| POST | `/api/auth/refresh` | Refrescar token |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET | `/api/auth/me` | Perfil del usuario actual |

### Documentos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/documents` | Listar documentos del usuario |
| POST | `/api/documents/upload` | Subir documento |
| GET | `/api/documents/:id` | Obtener metadata |
| GET | `/api/documents/:id/download` | Descargar documento firmado (ZIP) |
| POST | `/api/documents/:id/sign` | Firmar con algoritmo PQ |
| POST | `/api/documents/verify` | Verificar firma |
| GET | `/api/documents/stats` | Estadísticas |

### Crypto Service

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/crypto/keypair/generate` | Generar par de claves PQ |
| POST | `/crypto/sign` | Firmar datos |
| POST | `/crypto/verify` | Verificar firma |
| GET | `/crypto/algorithms` | Algoritmos disponibles |
| POST | `/crypto/kem/encapsulate` | Key encapsulation (ML-KEM) |
| POST | `/crypto/kem/decapsulate` | Key decapsulation |
| GET | `/crypto/health` | Health check |

## Testing

```bash
# Tests unitarios backend (67 tests)
cd backend && npm test

# Tests crypto service
cd crypto-service && pytest

# Tests E2E contra producción (18 tests)
cd frontend && E2E_BASE_URL=https://postcuantica.io npx playwright test

# Tests E2E locales
cd frontend && npm run test:e2e
```

## Estructura del proyecto

```
quantumguard-poc/
├── frontend/           # React 19 + TypeScript + Tailwind v4
│   ├── src/
│   │   ├── components/ # UI components (Button, Card, FileUpload...)
│   │   ├── pages/      # Home, Dashboard, SignDocument, Verify...
│   │   ├── services/   # API clients
│   │   ├── context/    # AuthContext (JWT)
│   │   └── hooks/      # useDocuments, etc.
│   └── e2e/            # 18 tests Playwright
├── backend/            # Node.js + Express + TypeScript + Sequelize
│   ├── src/
│   │   ├── controllers/  # auth, documents, kem, users
│   │   ├── services/     # crypto, auth, storage
│   │   ├── models/       # User, Document, Signature (Sequelize)
│   │   └── middleware/   # auth, rateLimit, validation
│   └── tests/           # 67 tests Jest
├── crypto-service/     # Python 3.11 + FastAPI + liboqs
│   ├── main.py         # Endpoints firma/verificación/KEM
│   ├── pki.py          # X.509 certificates
│   └── pdf_seal.py     # PDF quantum seal
├── database/           # SQL schemas + seeds
├── demo/               # Video demo + pitch deck
├── docker-compose.yml  # Desarrollo
└── docker-compose.prod.yml  # Producción
```

## Seguridad

- **Criptografía**: ML-DSA + SLH-DSA + ML-KEM (NIST FIPS 203/204/205)
- **Hashing**: SHA-3-256 (Keccak, quantum-resistant)
- **Autenticación**: JWT con refresh tokens
- **Rate limiting**: Por IP y por usuario
- **CORS + Helmet**: Headers de seguridad HTTP
- **Validación**: Sanitización en todas las entradas
- **Claves privadas**: Nunca expuestas en respuestas API

## Deploy

Actualmente desplegado en AWS EC2 (t3.small) con:
- Docker Compose para orquestación
- Nginx como reverse proxy
- Cloudflare para SSL/CDN
- Dominio: https://postcuantica.io

## Licencia

Propietario - Post Cuantica Lab SpA. Todos los derechos reservados.

---

<div align="center">

**Post Cuantica Lab SpA** | https://postcuantica.io

</div>

# QuantumGuard AI - POC

Sistema de firmas digitales post-cuanticas resistente a ataques de computadoras cuanticas.

## Descripcion

QuantumGuard AI es una plataforma que implementa firmas digitales utilizando el algoritmo **ML-DSA (CRYSTALS-Dilithium)**, certificado por el NIST como estandar post-cuantico. Protege documentos criticos con criptografia que permanecera segura incluso contra computadoras cuanticas futuras.

### Caracteristicas Principales

- **Firmas Post-Cuanticas**: ML-DSA-44, ML-DSA-65, ML-DSA-87 (Dilithium)
- **Performance**: 2,600+ firmas por segundo
- **Verificacion Instantanea**: <1ms por verificacion
- **Cumplimiento NIST**: Algoritmos certificados FIPS 204

## Arquitectura

```
+------------------+     +------------------+     +------------------+
|     Frontend     | --> |    Backend API   | --> |  Crypto Service  |
|  React + Vite    |     |  Node.js/Express |     |  Python/FastAPI  |
|   Tailwind CSS   |     |    TypeScript    |     |     liboqs       |
+------------------+     +------------------+     +------------------+
                                  |
                                  v
                         +------------------+
                         |   PostgreSQL     |
                         |    Database      |
                         +------------------+
```

## Quick Start

### Prerequisitos

- Docker & Docker Compose
- Node.js 18+
- Python 3.10+
- Git

### Instalacion Rapida

```bash
# 1. Clonar y entrar al proyecto
cd quantumguard-poc

# 2. Levantar base de datos
docker-compose up -d postgres redis

# 3. Iniciar Crypto Service
cd crypto-service
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 &

# 4. Iniciar Backend
cd ../backend
npm install
npm run dev &

# 5. Iniciar Frontend
cd ../frontend
npm install
npm run dev
```

El frontend estara disponible en `http://localhost:3000`

## Estructura del Proyecto

```
quantumguard-poc/
├── frontend/           # React + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/ # Componentes UI reutilizables
│   │   ├── pages/      # Paginas de la aplicacion
│   │   ├── services/   # Servicios API
│   │   ├── hooks/      # Custom React hooks
│   │   ├── context/    # React Context providers
│   │   └── types/      # TypeScript types
│   └── e2e/            # Tests E2E con Playwright
├── backend/            # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── models/
│   │   ├── routes/
│   │   └── middleware/
│   └── tests/
├── crypto-service/     # Python + FastAPI + liboqs
│   ├── main.py
│   └── tests/
├── database/           # SQL schemas
└── docker/             # Docker configs
```

## API Endpoints

### Autenticacion

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/auth/register` | POST | Registrar usuario |
| `/api/auth/login` | POST | Iniciar sesion |
| `/api/auth/refresh` | POST | Refrescar token |
| `/api/auth/logout` | POST | Cerrar sesion |

### Documentos

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/documents` | GET | Listar documentos |
| `/api/documents/upload` | POST | Subir documento |
| `/api/documents/:id` | GET | Obtener documento |
| `/api/documents/:id/sign` | POST | Firmar documento |
| `/api/documents/verify` | POST | Verificar firma |
| `/api/documents/stats` | GET | Estadisticas |

### Crypto Service

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/crypto/keypair/generate` | POST | Generar par de claves |
| `/crypto/sign` | POST | Firmar datos |
| `/crypto/verify` | POST | Verificar firma |
| `/crypto/algorithms` | GET | Algoritmos disponibles |
| `/crypto/health` | GET | Health check |

## Tecnologias

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS v4
- React Router v7
- Axios
- Lucide Icons
- Playwright (E2E testing)

### Backend
- Node.js 18+
- Express 4
- TypeScript
- Sequelize (ORM)
- JWT (autenticacion)
- Jest (testing)

### Crypto Service
- Python 3.10+
- FastAPI
- liboqs (Open Quantum Safe)
- ML-DSA (Dilithium)

### Base de Datos
- PostgreSQL 15+
- Redis (cache/rate limiting)

## Testing

```bash
# Tests unitarios del backend
cd backend && npm test

# Tests del crypto service
cd crypto-service && pytest

# Tests E2E del frontend
cd frontend && npm run test:e2e

# Ver reporte de tests E2E
npm run test:e2e:report
```

## Seguridad

- **Algoritmos**: ML-DSA-44/65/87 (NIST FIPS 204)
- **Validez de Firmas**: 50+ anos (quantum-safe)
- **Autenticacion**: JWT con refresh tokens
- **Rate Limiting**: Proteccion anti-brute force
- **CORS**: Configuracion restrictiva
- **Helmet**: Headers de seguridad HTTP
- **Validacion**: Sanitizacion de inputs

## Performance

| Operacion | Tiempo | Throughput |
|-----------|--------|------------|
| Generacion de keypair | 0.15ms | 6,634/seg |
| Firma de documento | 0.38ms | 2,661/seg |
| Verificacion | 0.19ms | 5,136/seg |

## Estado del Proyecto

- [x] Semana 1: Fundacion (99%)
- [x] Semana 2: Backend API (107%)
- [x] Semana 3: Frontend (93%)
- [ ] Semana 4: Testing & Demo

**Progreso Total: 79%**

## Licencia

Propietario - RYP Cloud

---

**Version:** 0.3.0 (POC)
**Fecha:** Febrero 2026
**Estado:** Frontend Completado

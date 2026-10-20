# 📦 Guía de Instalación - QuantumGuard AI POC

## 🎯 Requisitos Previos

### Software Necesario

```bash
# Verificar versiones instaladas
node --version    # v18.0.0 o superior
python --version  # 3.10 o superior
docker --version  # 20.0 o superior
git --version     # 2.0 o superior
```

### Sistema Operativo

- Linux (Ubuntu 20.04+, Debian 11+)
- macOS (12.0+)
- Windows (con WSL2)

---

## 🚀 Instalación Rápida (5 minutos)

### Paso 1: Clonar el Repositorio

```bash
cd ~/proyectos
cd quantumguard-poc
```

### Paso 2: Configurar Variables de Entorno

```bash
# Crypto Service
cp crypto-service/.env.example crypto-service/.env

# Backend
cp backend/.env.example backend/.env

# Editar si es necesario (opcional para desarrollo local)
nano backend/.env
```

### Paso 3: Levantar Servicios con Docker

```bash
# Iniciar todos los servicios
docker-compose up -d

# Verificar que estén corriendo
docker-compose ps
```

**Servicios disponibles:**
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`
- **Crypto Service:** `http://localhost:8001`

### Paso 4: Instalar Dependencias del Crypto Service

```bash
cd crypto-service

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual
source venv/bin/activate  # En Windows: venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

### Paso 5: Instalar Dependencias del Backend

```bash
cd ../backend

# Instalar dependencias de Node.js
npm install

# Compilar TypeScript
npm run build
```

### Paso 6: Inicializar Base de Datos

```bash
# Crear las tablas
docker exec -i quantumguard-postgres psql -U quantum_user -d quantumguard < database/schema.sql
```

---

## 🎬 Iniciar el Proyecto

### Opción A: Con Docker (Recomendado)

```bash
# Desde la raíz del proyecto
docker-compose up

# Para ver logs en tiempo real
docker-compose logs -f
```

### Opción B: Desarrollo Local

**Terminal 1 - Crypto Service:**
```bash
cd crypto-service
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**Terminal 2 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 3 - Frontend (cuando esté disponible):**
```bash
cd frontend
npm run dev
```

---

## ✅ Verificación de Instalación

### 1. Verificar Crypto Service

```bash
curl http://localhost:8001/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-17T...",
  "service": "crypto-service"
}
```

### 2. Verificar Backend

```bash
curl http://localhost:5000/health
```

**Respuesta esperada:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-17T...",
  "service": "backend-api"
}
```

### 3. Verificar Base de Datos

```bash
docker exec -it quantumguard-postgres psql -U quantum_user -d quantumguard -c "SELECT version();"
```

### 4. Test de Firma Digital

```bash
# Crear un archivo de prueba
echo "Este es un documento de prueba" > test.txt

# Firmar el documento
curl -X POST http://localhost:8001/crypto/sign \
  -F "file=@test.txt" \
  -F "algorithm=Dilithium2"
```

**Respuesta esperada:**
```json
{
  "signature_id": "...",
  "document_hash": "...",
  "signature": "...",
  "public_key": "...",
  "algorithm": "Dilithium2",
  "quantum_safe": true
}
```

---

## 🔧 Configuración Avanzada

### Cambiar Puerto del Backend

Editar `backend/.env`:
```env
PORT=8000  # Cambiar a tu puerto preferido
```

### Cambiar Puerto del Crypto Service

Editar `crypto-service/.env`:
```env
PORT=8002  # Cambiar a tu puerto preferido
```

Actualizar también en `backend/.env`:
```env
CRYPTO_SERVICE_URL=http://localhost:8002
```

### Configurar CORS

Editar `backend/.env`:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080,https://midominio.com
```

---

## 🐛 Troubleshooting

### Error: "liboqs not found"

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y cmake libssl-dev build-essential

# macOS
brew install cmake openssl

# Reinstalar liboqs
pip install liboqs-python --force-reinstall
```

### Error: "Port already in use"

```bash
# Verificar qué proceso usa el puerto
lsof -i :8001  # Para crypto-service
lsof -i :5000  # Para backend

# Matar el proceso
kill -9 <PID>

# O cambiar el puerto en .env
```

### Error: "Cannot connect to PostgreSQL"

```bash
# Verificar que Docker esté corriendo
docker ps

# Reiniciar el contenedor de PostgreSQL
docker-compose restart postgres

# Ver logs
docker-compose logs postgres
```

### Error: "Permission denied" en Linux

```bash
# Dar permisos a la carpeta uploads
sudo chmod -R 755 backend/uploads

# O cambiar ownership
sudo chown -R $USER:$USER .
```

---

## 🧪 Testing

### Test del Crypto Service

```bash
cd crypto-service
pytest tests/ -v
```

### Test del Backend

```bash
cd backend
npm test
```

### Test End-to-End

```bash
# Desde la raíz
npm run test:e2e
```

---

## 📊 Monitoreo

### Ver Logs

```bash
# Todos los servicios
docker-compose logs -f

# Un servicio específico
docker-compose logs -f crypto-service
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Métricas de Performance

```bash
# Benchmarks del crypto service
curl http://localhost:8001/crypto/benchmark
```

---

## 🛑 Detener el Proyecto

```bash
# Detener servicios
docker-compose down

# Detener y eliminar volúmenes (⚠️ borra la base de datos)
docker-compose down -v
```

---

## 📚 Próximos Pasos

Una vez instalado:

1. ✅ Revisar [README.md](./README.md)
2. ✅ Consultar [PLAN_DESARROLLO_POC_QUANTUMGUARD.md](../PLAN_DESARROLLO_POC_QUANTUMGUARD.md)
3. ✅ Seguir [CHECKLIST_PROYECTO_QUANTUMGUARD.md](../CHECKLIST_PROYECTO_QUANTUMGUARD.md)
4. ✅ Explorar la API: `http://localhost:8001/docs` (Crypto Service)
5. ✅ Empezar desarrollo del Frontend

---

## 🆘 Soporte

Para problemas o preguntas:

- Revisar issues en GitHub
- Contactar al equipo de desarrollo
- Consultar documentación adicional en `/docs`

---

**Versión:** 1.0.0
**Última actualización:** Octubre 2025

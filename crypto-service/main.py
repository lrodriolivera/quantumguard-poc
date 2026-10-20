"""
QuantumGuard AI - Crypto Service
Post-Quantum Cryptography: ML-DSA (Dilithium), SLH-DSA (SPHINCS+), ML-KEM (Kyber)
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import oqs
import hashlib
import base64
import json
import uuid
import binascii
from datetime import datetime, timedelta, timezone
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="QuantumGuard Crypto Service",
    description="""
    ## Post-Quantum Cryptographic API

    Secure digital signatures and key encapsulation using **NIST-certified**
    post-quantum cryptography algorithms.

    ### Signature Algorithms
    - **ML-DSA** (FIPS 204) - Lattice-based signatures (Dilithium)
    - **SLH-DSA** (FIPS 205) - Hash-based signatures (SPHINCS+)

    ### Key Encapsulation
    - **ML-KEM** (FIPS 203) - Lattice-based key encapsulation (Kyber)

    ### Features
    - Quantum-safe digital signatures (ML-DSA + SLH-DSA)
    - Quantum-safe key encapsulation (ML-KEM)
    - NIST FIPS 203/204/205 certified algorithms
    - X.509 certificates (RFC 9881 / RFC 9909) and CMS SignedData (RFC 9882 / RFC 9814)
    - SHA-3-256 document fingerprints
    """,
    version="2.0.0",
    contact={
        "name": "QuantumGuard AI",
        "url": "https://postcuantica.io",
        "email": "info@postcuantica.io"
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT"
    }
)

# CORS middleware
import os
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICE_TOKEN = os.environ.get("CRYPTO_SERVICE_TOKEN", "")
UNAUTHENTICATED_PATHS = {"/health"}


@app.middleware("http")
async def require_service_token(request, call_next):
    """Only the backend may use this service: anything else on the Docker
    network could otherwise obtain certificates from the CA."""
    if SERVICE_TOKEN and request.url.path not in UNAUTHENTICATED_PATHS:
        import hmac
        from fastapi.responses import JSONResponse
        supplied = request.headers.get("authorization", "")
        if not hmac.compare_digest(supplied.encode(), f"Bearer {SERVICE_TOKEN}".encode()):
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


class InputError(ValueError):
    """Invalid client input; surfaced as HTTP 400."""


@app.exception_handler(InputError)
async def input_error_handler(request, exc: InputError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=400, content={"detail": str(exc)})


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def decode_b64(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise InputError(f"{field} is not valid base64")


def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise InputError("signed_at must be an ISO-8601 timestamp")
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

# ============================================================
# Pydantic Models - Signatures
# ============================================================

class KeypairResponse(BaseModel):
    public_key: str
    algorithm: str
    created_at: str
    quantum_safe: bool
    key_size: int

class SignatureResponse(BaseModel):
    signature_id: str
    document_hash: str
    signature: str
    public_key: str
    algorithm: str
    timestamp: str
    valid_until: Optional[str] = None
    quantum_safe: bool
    signature_size: int

class VerificationResponse(BaseModel):
    valid: bool
    document_hash: str
    algorithm: str
    verification_timestamp: str
    quantum_safe: bool
    details: Dict[str, str]

# ============================================================
# Pydantic Models - KEM
# ============================================================

class KEMKeypairResponse(BaseModel):
    keypair_id: str
    public_key: str
    algorithm: str
    public_key_size: int
    secret_key_size: int
    created_at: str
    expires_at: str
    quantum_safe: bool

class EncapsulationResponse(BaseModel):
    ciphertext: str
    shared_secret: str
    algorithm: str
    ciphertext_size: int
    shared_secret_size: int
    timestamp: str
    quantum_safe: bool

class DecapsulationResponse(BaseModel):
    shared_secret: str
    algorithm: str
    shared_secret_size: int
    timestamp: str
    quantum_safe: bool

# ============================================================
# Quantum Crypto Service - Signatures (ML-DSA + SLH-DSA)
# ============================================================

class QuantumCryptoService:
    """Service for post-quantum signature operations"""

    def __init__(self):
        """Initialize supported signature algorithms"""
        # Get available signature mechanisms from liboqs
        enabled_sigs = oqs.get_enabled_sig_mechanisms()

        # ML-DSA (Dilithium) - FIPS 204 - Lattice-based
        self.supported_algorithms = {
            'Dilithium2': 'ML-DSA-44',
            'Dilithium3': 'ML-DSA-65',
            'Dilithium5': 'ML-DSA-87',
            'ML-DSA-44': 'ML-DSA-44',
            'ML-DSA-65': 'ML-DSA-65',
            'ML-DSA-87': 'ML-DSA-87',
        }

        # SLH-DSA (SPHINCS+) - FIPS 205 - Hash-based
        slh_dsa_algorithms = {
            'SLH-DSA-SHA2-128s': 'SLH_DSA_PURE_SHA2_128S',
            'SLH-DSA-SHA2-192s': 'SLH_DSA_PURE_SHA2_192S',
            'SLH-DSA-SHA2-256s': 'SLH_DSA_PURE_SHA2_256S',
        }

        for name, oqs_name in slh_dsa_algorithms.items():
            if oqs_name in enabled_sigs:
                self.supported_algorithms[name] = oqs_name
                logger.info(f"SLH-DSA algorithm available: {name} -> {oqs_name}")
            else:
                logger.warning(f"SLH-DSA algorithm NOT available: {oqs_name}")

        # Algorithm metadata for rich API responses
        self.algorithm_metadata = {
            'ML-DSA-44': {
                'family': 'ML-DSA', 'standard': 'FIPS 204',
                'security_level': 2, 'type': 'lattice',
                'signature_size': 2420, 'public_key_size': 1312,
            },
            'ML-DSA-65': {
                'family': 'ML-DSA', 'standard': 'FIPS 204',
                'security_level': 3, 'type': 'lattice',
                'signature_size': 3309, 'public_key_size': 1952,
            },
            'ML-DSA-87': {
                'family': 'ML-DSA', 'standard': 'FIPS 204',
                'security_level': 5, 'type': 'lattice',
                'signature_size': 4627, 'public_key_size': 2592,
            },
            'SLH-DSA-SHA2-128s': {
                'family': 'SLH-DSA', 'standard': 'FIPS 205',
                'security_level': 1, 'type': 'hash-based',
                'signature_size': 7856, 'public_key_size': 32,
            },
            'SLH-DSA-SHA2-192s': {
                'family': 'SLH-DSA', 'standard': 'FIPS 205',
                'security_level': 3, 'type': 'hash-based',
                'signature_size': 16224, 'public_key_size': 48,
            },
            'SLH-DSA-SHA2-256s': {
                'family': 'SLH-DSA', 'standard': 'FIPS 205',
                'security_level': 5, 'type': 'hash-based',
                'signature_size': 29792, 'public_key_size': 64,
            },
        }

        # Map aliases to their canonical metadata key
        self._alias_map = {
            'Dilithium2': 'ML-DSA-44',
            'Dilithium3': 'ML-DSA-65',
            'Dilithium5': 'ML-DSA-87',
        }

        logger.info(f"Initialized QuantumCryptoService with algorithms: {list(self.supported_algorithms.keys())}")

    def get_metadata(self, algorithm: str) -> Dict[str, Any]:
        """Get metadata for an algorithm, resolving aliases"""
        canonical = self._alias_map.get(algorithm, algorithm)
        return self.algorithm_metadata.get(canonical, {})

    def canonical(self, algorithm: str) -> str:
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported algorithm: {algorithm}")
        return self._alias_map.get(algorithm, algorithm)

    def verify_raw(self, document_bytes: bytes, signature_bytes: bytes,
                   public_key_bytes: bytes, algorithm: str) -> bool:
        """liboqs verification with strict size checks (pure mode, empty context)."""
        with oqs.Signature(self.supported_algorithms[algorithm]) as verifier:
            if len(public_key_bytes) != verifier.details['length_public_key']:
                raise InputError(f"Public key size does not match {algorithm}")
            if len(signature_bytes) > verifier.details['length_signature']:
                return False
            return verifier.verify(document_bytes, signature_bytes, public_key_bytes)

    def verification_details(self, algorithm: str) -> Dict[str, str]:
        meta = self.get_metadata(algorithm)
        return {
            'algorithm_family': meta.get('family', 'Unknown'),
            'nist_standard': meta.get('standard', 'Unknown'),
            'security_level': f"NIST Level {meta.get('security_level', '?')}",
            'algorithm_type': meta.get('type', 'unknown'),
        }

    def generate_keypair(self, algorithm: str = 'Dilithium2') -> KeypairResponse:
        """Generate a new quantum-safe keypair"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported algorithm: {algorithm}")
        try:

            oqs_algorithm = self.supported_algorithms[algorithm]
            signer = oqs.Signature(oqs_algorithm)
            public_key = signer.generate_keypair()

            return KeypairResponse(
                public_key=base64.b64encode(public_key).decode(),
                algorithm=algorithm,
                created_at=utc_now_iso(),
                quantum_safe=True,
                key_size=len(public_key)
            )

        except InputError:
            raise
        except Exception as e:
            logger.error(f"Keypair generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Keypair generation failed: {str(e)}")

    def sign_document(
        self,
        document_bytes: bytes,
        algorithm: str = 'Dilithium2',
        metadata: Optional[Dict[str, Any]] = None
    ) -> SignatureResponse:
        """Sign a document with quantum-safe cryptography"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported algorithm: {algorithm}")
        try:

            # Calculate document hash using SHA-3-256 (quantum-resistant)
            document_hash = hashlib.sha3_256(document_bytes).hexdigest()

            oqs_algorithm = self.supported_algorithms[algorithm]
            signer = oqs.Signature(oqs_algorithm)
            public_key = signer.generate_keypair()
            signature_bytes = signer.sign(document_bytes)

            # Ephemeral demo key: not certified, so it carries no validity period.
            result = SignatureResponse(
                signature_id=str(uuid.uuid4()),
                document_hash=document_hash,
                signature=base64.b64encode(signature_bytes).decode(),
                public_key=base64.b64encode(public_key).decode(),
                algorithm=self._alias_map.get(algorithm, algorithm),
                timestamp=utc_now_iso(),
                quantum_safe=True,
                signature_size=len(signature_bytes)
            )

            logger.info(f"Document signed with {algorithm}. Hash: {document_hash[:16]}... Size: {len(signature_bytes)} bytes")
            return result

        except InputError:
            raise
        except Exception as e:
            logger.error(f"Document signing failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Document signing failed: {str(e)}")

    def verify_signature(
        self,
        document_bytes: bytes,
        signature: str,
        public_key: str,
        algorithm: str = 'Dilithium2'
    ) -> VerificationResponse:
        """Verify a signature against a caller-supplied raw public key.

        This only proves the key matches the signature; callers must establish
        that the key itself is trusted (certificate chain or registry lookup).
        """
        canonical = self.canonical(algorithm)
        is_valid = self.verify_raw(
            document_bytes, decode_b64(signature, 'signature'),
            decode_b64(public_key, 'public_key'), algorithm,
        )
        return VerificationResponse(
            valid=is_valid,
            document_hash=hashlib.sha3_256(document_bytes).hexdigest(),
            algorithm=canonical,
            verification_timestamp=utc_now_iso(),
            quantum_safe=True,
            details=self.verification_details(canonical),
        )

# ============================================================
# Quantum KEM Service - Key Encapsulation (ML-KEM / Kyber)
# ============================================================

KEM_KEY_TTL_SECONDS = 15 * 60
KEM_MAX_STORED_KEYS = 1000


class QuantumKEMService:
    """Service for post-quantum Key Encapsulation Mechanism operations.

    Secret keys never leave the service: the explorer gets a keypair_id and
    the secret key is held in memory until it expires.
    """

    def __init__(self):
        from collections import OrderedDict
        self._secret_keys: "OrderedDict[str, tuple]" = OrderedDict()
        """Initialize supported KEM algorithms"""
        enabled_kems = oqs.get_enabled_kem_mechanisms()

        self.supported_algorithms = {}
        kem_algorithms = {
            'ML-KEM-512': 'ML-KEM-512',
            'ML-KEM-768': 'ML-KEM-768',
            'ML-KEM-1024': 'ML-KEM-1024',
        }

        for name, oqs_name in kem_algorithms.items():
            if oqs_name in enabled_kems:
                self.supported_algorithms[name] = oqs_name
                logger.info(f"KEM algorithm available: {name} -> {oqs_name}")
            else:
                logger.warning(f"KEM algorithm NOT available: {oqs_name}")

        self.algorithm_metadata = {
            'ML-KEM-512': {
                'family': 'ML-KEM', 'standard': 'FIPS 203',
                'security_level': 1, 'type': 'lattice',
                'public_key_size': 800, 'ciphertext_size': 768,
                'shared_secret_size': 32,
            },
            'ML-KEM-768': {
                'family': 'ML-KEM', 'standard': 'FIPS 203',
                'security_level': 3, 'type': 'lattice',
                'public_key_size': 1184, 'ciphertext_size': 1088,
                'shared_secret_size': 32,
            },
            'ML-KEM-1024': {
                'family': 'ML-KEM', 'standard': 'FIPS 203',
                'security_level': 5, 'type': 'lattice',
                'public_key_size': 1568, 'ciphertext_size': 1568,
                'shared_secret_size': 32,
            },
        }

        logger.info(f"Initialized QuantumKEMService with algorithms: {list(self.supported_algorithms.keys())}")

    def generate_keypair(self, algorithm: str = 'ML-KEM-768') -> KEMKeypairResponse:
        """Generate a new KEM keypair"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported KEM algorithm: {algorithm}")
        try:

            oqs_alg = self.supported_algorithms[algorithm]
            kem = oqs.KeyEncapsulation(oqs_alg)
            public_key = kem.generate_keypair()
            secret_key = kem.export_secret_key()
            keypair_id = str(uuid.uuid4())
            expires = datetime.now(timezone.utc) + timedelta(seconds=KEM_KEY_TTL_SECONDS)
            self._store_secret(keypair_id, secret_key, algorithm, expires)

            return KEMKeypairResponse(
                keypair_id=keypair_id,
                public_key=base64.b64encode(public_key).decode(),
                algorithm=algorithm,
                public_key_size=len(public_key),
                secret_key_size=len(secret_key),
                created_at=utc_now_iso(),
                expires_at=expires.isoformat(),
                quantum_safe=True,
            )

        except InputError:
            raise
        except Exception as e:
            logger.error(f"KEM keypair generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"KEM keypair generation failed: {str(e)}")

    def encapsulate(self, public_key: str, algorithm: str = 'ML-KEM-768') -> EncapsulationResponse:
        """Encapsulate: generate shared secret + ciphertext from public key"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported KEM algorithm: {algorithm}")
        try:

            oqs_alg = self.supported_algorithms[algorithm]
            kem = oqs.KeyEncapsulation(oqs_alg)
            pk_bytes = decode_b64(public_key, 'public_key')
            ciphertext, shared_secret = kem.encap_secret(pk_bytes)

            return EncapsulationResponse(
                ciphertext=base64.b64encode(ciphertext).decode(),
                shared_secret=base64.b64encode(shared_secret).decode(),
                algorithm=algorithm,
                ciphertext_size=len(ciphertext),
                shared_secret_size=len(shared_secret),
                timestamp=utc_now_iso(),
                quantum_safe=True,
            )

        except InputError:
            raise
        except Exception as e:
            logger.error(f"KEM encapsulation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"KEM encapsulation failed: {str(e)}")

    def _store_secret(self, keypair_id: str, secret_key: bytes, algorithm: str, expires: datetime) -> None:
        now = datetime.now(timezone.utc)
        for key in [k for k, (_, _, exp) in self._secret_keys.items() if exp <= now]:
            del self._secret_keys[key]
        while len(self._secret_keys) >= KEM_MAX_STORED_KEYS:
            self._secret_keys.popitem(last=False)
        self._secret_keys[keypair_id] = (secret_key, algorithm, expires)

    def _load_secret(self, keypair_id: str, algorithm: str) -> bytes:
        entry = self._secret_keys.get(keypair_id)
        if not entry or entry[2] <= datetime.now(timezone.utc):
            self._secret_keys.pop(keypair_id, None)
            raise InputError("Unknown or expired keypair_id; generate a new keypair")
        if entry[1] != algorithm:
            raise InputError("keypair_id belongs to a different KEM algorithm")
        return entry[0]

    def decapsulate(self, ciphertext: str, keypair_id: str, algorithm: str = 'ML-KEM-768') -> DecapsulationResponse:
        """Decapsulate: recover shared secret from ciphertext with the server-held secret key"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported KEM algorithm: {algorithm}")
        try:

            oqs_alg = self.supported_algorithms[algorithm]
            sk_bytes = self._load_secret(keypair_id, algorithm)
            kem = oqs.KeyEncapsulation(oqs_alg, secret_key=sk_bytes)
            ct_bytes = decode_b64(ciphertext, 'ciphertext')
            shared_secret = kem.decap_secret(ct_bytes)

            return DecapsulationResponse(
                shared_secret=base64.b64encode(shared_secret).decode(),
                algorithm=algorithm,
                shared_secret_size=len(shared_secret),
                timestamp=utc_now_iso(),
                quantum_safe=True,
            )

        except InputError:
            raise
        except Exception as e:
            logger.error(f"KEM decapsulation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"KEM decapsulation failed: {str(e)}")

# ============================================================
# Initialize services
# ============================================================

crypto_service = QuantumCryptoService()
kem_service = QuantumKEMService()

# ============================================================
# API Endpoints - General
# ============================================================

@app.get("/", tags=["General"])
async def root():
    """Root endpoint"""
    return {
        "service": "QuantumGuard Crypto Service",
        "version": "2.0.0",
        "signature_algorithms": list(crypto_service.supported_algorithms.keys()),
        "kem_algorithms": list(kem_service.supported_algorithms.keys()),
        "status": "operational",
        "quantum_safe": True,
    }

@app.get("/health", tags=["General"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": utc_now_iso(),
        "service": "crypto-service",
    }

# ============================================================
# API Endpoints - Signatures (ML-DSA + SLH-DSA)
# ============================================================

@app.post("/crypto/keypair/generate", response_model=KeypairResponse,
          summary="Generate Quantum-Safe Keypair",
          tags=["Signatures"])
async def generate_keypair(algorithm: str = Form(default='Dilithium2', description="Algorithm name")):
    """Generate a new quantum-safe keypair"""
    return crypto_service.generate_keypair(algorithm)

@app.post("/crypto/sign", response_model=SignatureResponse,
          summary="Sign Document",
          tags=["Signatures"])
async def sign_document(
    file: UploadFile = File(..., description="Document file to sign"),
    algorithm: str = Form(default='Dilithium2', description="Signature algorithm"),
    metadata: Optional[str] = Form(default=None, description="Optional metadata as JSON string")
):
    """Sign a document with quantum-safe cryptography (ML-DSA or SLH-DSA)"""
    try:
        document_bytes = await file.read()
        metadata_dict = json.loads(metadata) if metadata else None
        return crypto_service.sign_document(document_bytes, algorithm, metadata_dict)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid metadata JSON")
    except (InputError, HTTPException):
        raise
    except Exception as e:
        logger.error(f"Error in sign_document endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/crypto/verify", response_model=VerificationResponse,
          summary="Verify Signature",
          tags=["Signatures"])
async def verify_signature(
    file: UploadFile = File(..., description="Original document file"),
    signature: str = Form(..., description="Base64-encoded signature"),
    public_key: str = Form(..., description="Base64-encoded public key"),
    algorithm: str = Form(default='Dilithium2', description="Signature algorithm")
):
    """Verify a quantum-safe signature (ML-DSA or SLH-DSA)"""
    try:
        document_bytes = await file.read()
        return crypto_service.verify_signature(document_bytes, signature, public_key, algorithm)
    except (InputError, HTTPException):
        raise
    except Exception as e:
        logger.error(f"Error in verify_signature endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/crypto/algorithms",
         summary="List Signature Algorithms",
         tags=["Signatures"])
async def list_algorithms():
    """List supported post-quantum signature algorithms with metadata"""
    algorithms = {}
    for name, oqs_name in crypto_service.supported_algorithms.items():
        meta = crypto_service.get_metadata(name)
        if meta:
            algorithms[name] = {
                'oqs_name': oqs_name,
                'family': meta.get('family'),
                'standard': meta.get('standard'),
                'security_level': meta.get('security_level'),
                'type': meta.get('type'),
                'signature_size_bytes': meta.get('signature_size'),
                'public_key_size_bytes': meta.get('public_key_size'),
            }
    return {
        "algorithms": algorithms,
        "default": "ML-DSA-44",
        "families": ["ML-DSA (FIPS 204)", "SLH-DSA (FIPS 205)"],
    }

# ============================================================
# API Endpoints - Key Encapsulation (ML-KEM / Kyber)
# ============================================================

@app.post("/crypto/kem/keypair/generate", response_model=KEMKeypairResponse,
          summary="Generate KEM Keypair",
          tags=["Key Encapsulation (KEM)"])
async def kem_generate_keypair(
    algorithm: str = Form(default='ML-KEM-768', description="KEM algorithm")
):
    """Generate a new ML-KEM (Kyber) keypair for key encapsulation"""
    return kem_service.generate_keypair(algorithm)

@app.post("/crypto/kem/encapsulate", response_model=EncapsulationResponse,
          summary="Encapsulate (Create Shared Secret)",
          tags=["Key Encapsulation (KEM)"])
async def kem_encapsulate(
    public_key: str = Form(..., description="Base64-encoded public key"),
    algorithm: str = Form(default='ML-KEM-768', description="KEM algorithm")
):
    """Encapsulate: generate a shared secret and ciphertext from a public key"""
    return kem_service.encapsulate(public_key, algorithm)

@app.post("/crypto/kem/decapsulate", response_model=DecapsulationResponse,
          summary="Decapsulate (Recover Shared Secret)",
          tags=["Key Encapsulation (KEM)"])
async def kem_decapsulate(
    ciphertext: str = Form(..., description="Base64-encoded ciphertext"),
    keypair_id: str = Form(..., description="Keypair id returned by /crypto/kem/keypair/generate"),
    algorithm: str = Form(default='ML-KEM-768', description="KEM algorithm")
):
    """Decapsulate: recover the shared secret using the secret key held by the service"""
    return kem_service.decapsulate(ciphertext, keypair_id, algorithm)

@app.get("/crypto/kem/algorithms",
         summary="List KEM Algorithms",
         tags=["Key Encapsulation (KEM)"])
async def list_kem_algorithms():
    """List supported ML-KEM (Kyber) algorithms with metadata"""
    algorithms = {}
    for name, oqs_name in kem_service.supported_algorithms.items():
        meta = kem_service.algorithm_metadata.get(name, {})
        algorithms[name] = {
            'oqs_name': oqs_name,
            'family': meta.get('family'),
            'standard': meta.get('standard'),
            'security_level': meta.get('security_level'),
            'type': meta.get('type'),
            'public_key_size_bytes': meta.get('public_key_size'),
            'ciphertext_size_bytes': meta.get('ciphertext_size'),
            'shared_secret_size_bytes': meta.get('shared_secret_size'),
        }
    return {
        "algorithms": algorithms,
        "default": "ML-KEM-768",
        "family": "ML-KEM (FIPS 203)",
    }

# ============================================================
# API Endpoints - PKI (X.509 Certificates + CMS SignedData)
# ============================================================

import ca as ca_module
import pki as pki_module
import pdf_seal
import pdf_sign
import tsa as tsa_module
from fastapi.responses import Response, PlainTextResponse


@app.on_event("startup")
async def startup_pki():
    """Load the CA hierarchy. Missing parts are only created when PKI_AUTO_INIT_CA allows it."""
    allow_create = os.environ.get("PKI_AUTO_INIT_CA", "true").lower() == "true"
    try:
        logger.info(f"PKI: {pki_module.get_openssl_version()}")
        status = ca_module.ensure_hierarchy(allow_create=allow_create)
        logger.info(f"PKI: hierarchy ready {status}")
    except Exception as e:
        logger.error(f"PKI: Certificate Authority unavailable, signing disabled: {e}")


def _form_bool(value: Optional[str], default: bool) -> bool:
    if value is None or value == "":
        return default
    if value.lower() in ("true", "1", "yes", "on"):
        return True
    if value.lower() in ("false", "0", "no", "off"):
        return False
    raise InputError(f"Invalid boolean value: {value}")


def _country(value: Optional[str]) -> str:
    country = (value or ca_module.DEFAULT_COUNTRY).upper()
    if country not in ca_module.COUNTRIES:
        raise InputError(f"Unsupported country: {value}. Supported: {', '.join(ca_module.COUNTRIES)}")
    return country


def _is_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


def _signer_summary(signer: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in signer.items() if k != "certificate_pem"}


@app.get("/crypto/pki/countries", summary="Countries with an issuing CA", tags=["PKI (X.509)"])
async def list_countries():
    return {
        "countries": [{"code": code, "name": name} for code, name in ca_module.COUNTRIES.items()],
        "default": ca_module.DEFAULT_COUNTRY,
    }


@app.post("/crypto/sign-x509",
          summary="Sign Document with X.509 Certificate + CMS",
          tags=["PKI (X.509)"])
async def sign_document_x509(
    file: UploadFile = File(..., description="Document file to sign"),
    algorithm: str = Form(default='ML-DSA-44', description="Post-quantum signature algorithm"),
    signer_name: Optional[str] = Form(default=None, description="Signer display name (certificate CN)"),
    signer_email: Optional[str] = Form(default=None, description="Signer email (certificate SAN)"),
    country: Optional[str] = Form(default=None, description="Issuing CA country: CL, CO or ES"),
    hybrid: Optional[str] = Form(default=None, description="Also sign with ECDSA P-256 (default true)"),
    previous_signed_pdf: Optional[UploadFile] = File(
        default=None,
        description="PDF already signed by an earlier envelope signer — this signer's signature is "
                    "stacked on top via an incremental update instead of starting a fresh seal",
    ),
    signer_index: Optional[str] = Form(
        default=None, description="1-based position of this signer within the envelope (keeps PDF signature field names unique)"
    ),
):
    """
    Sign a document with CA-certified keys bound to the signer's identity.

    Produces: raw post-quantum signature (FIPS 204/205), CMS SignedData with one
    SignerInfo per key (RFC 9882 / RFC 9814; ML-DSA + ECDSA P-256 when hybrid),
    an RFC 3161 time-stamp over the CMS and, for PDFs, a copy with the
    signatures embedded. The raw signature is cross-checked with liboqs.
    """
    canonical = crypto_service.canonical(algorithm)
    issuing_country = _country(country)
    is_hybrid = _form_bool(hybrid, True)
    document_bytes = await file.read()
    signature_id = str(uuid.uuid4())
    document_hash = hashlib.sha3_256(document_bytes).hexdigest()

    try:
        pdf_to_embed = None
        if previous_signed_pdf is not None:
            # Stack this signature on top of an earlier signer's already-signed PDF via a pure
            # incremental update. Re-running the visual seal here would require rewriting the file
            # with pypdf, which is not incremental-aware and would invalidate the earlier signer's
            # signature byte ranges — so later signers get the CMS signature but not another seal.
            pdf_to_embed = await previous_signed_pdf.read()
        elif _is_pdf(document_bytes):
            meta = crypto_service.get_metadata(canonical)
            now = datetime.now(timezone.utc)
            pdf_to_embed = pdf_seal.add_seal_to_pdf(
                pdf_bytes=document_bytes,
                algorithm=canonical,
                algorithm_display=f"{canonical} (NIST Level {meta.get('security_level', '?')})"
                + (" + ECDSA P-256" if is_hybrid else ""),
                document_hash=document_hash,
                signed_at=now.isoformat(),
                valid_until=(now + timedelta(days=pki_module.SIGNER_CERT_DAYS)).isoformat(),
                signature_id=signature_id,
                oid=pki_module.ALGORITHMS[canonical].oid,
                nist_standard=meta.get('standard', ''),
                verify_base_url=f"{os.environ.get('PKI_PUBLIC_BASE_URL', 'https://app.postcuantica.io').rstrip('/')}/verificar",
            )
        result = pki_module.sign_document_full(
            document_bytes=document_bytes,
            algorithm=canonical,
            signer_name=signer_name,
            signer_email=signer_email,
            country=issuing_country,
            hybrid=is_hybrid,
            pdf_to_embed=pdf_to_embed,
            pdf_field_suffix=f"-{signer_index}" if signer_index else "",
        )
        if not crypto_service.verify_raw(
            document_bytes, result["signature_raw"], result["public_key_raw"], canonical,
        ):
            raise ca_module.PKIError("Self-check failed: liboqs rejected the OpenSSL signature")
        stamp = tsa_module.create_timestamp(result["cms_der"])
    except ca_module.PKIError as e:
        logger.error(f"Error in sign_document_x509: {e}")
        raise HTTPException(status_code=503, detail=str(e))

    cert = result["certificate"]
    classical = result["classical"]
    return {
        "signature_id": signature_id,
        "document_hash": document_hash,
        "signature": pki_module.b64(result["signature_raw"]),
        "public_key": pki_module.b64(result["public_key_raw"]),
        "algorithm": canonical,
        "timestamp": stamp["gen_time"].isoformat(),
        "valid_until": cert["not_after"].isoformat(),
        "quantum_safe": True,
        "signature_size": len(result["signature_raw"]),
        "country": issuing_country,
        "hybrid": classical is not None,
        "classical": {
            "algorithm": pki_module.CLASSICAL_SIGNATURE_ALGORITHM,
            "signature": pki_module.b64(classical["signature_raw"]),
            "cert_pem": classical["cert_pem"],
            "certificate": pki_module.certificate_summary(classical["info"]),
        } if classical else None,
        "time_stamp": {
            "token": pki_module.b64(stamp["token"]),
            "gen_time": stamp["gen_time"].isoformat(),
            "serial": stamp["serial"],
            "policy": tsa_module.TSA_POLICY_OID,
        },
        "signed_pdf": pki_module.b64(result["signed_pdf"]) if result["signed_pdf"] else None,
        "pki": {
            "signer_cert_pem": result["signer_cert_pem"],
            "issuer_cert_pem": result["issuer_cert_pem"],
            "ca_cert_pem": result["root_cert_pem"],
            "tsa_cert_pem": ca_module.certificate_pem("tsa"),
            "cms_signature_b64": pki_module.b64(result["cms_der"]),
            "cms_size": len(result["cms_der"]),
            "cms_digest": result["cms_digest"],
            "oid": result["oid"],
            "certificate": pki_module.certificate_summary(cert),
            "verified": True,
            "standards": (
                ["RFC 9909 (SLH-DSA in X.509)", "RFC 9814 (SLH-DSA in CMS)", "RFC 3161 (time-stamp)"]
                if canonical.startswith("SLH-DSA")
                else ["RFC 9881 (ML-DSA in X.509)", "RFC 9882 (ML-DSA in CMS)", "RFC 3161 (time-stamp)"]
            ),
        },
    }


@app.post("/crypto/verify-x509",
          summary="Verify Signature against a QuantumGuard Certificate",
          tags=["PKI (X.509)"])
async def verify_signature_x509(
    file: UploadFile = File(..., description="Original document file"),
    signature: str = Form(..., description="Base64-encoded raw post-quantum signature"),
    certificate: str = Form(..., description="Signer certificate (PEM)"),
    signed_at: Optional[str] = Form(default=None, description="Trusted signing time (ISO-8601), if known"),
):
    """
    Verify a raw signature using only the key inside the signer certificate,
    which must chain to a QuantumGuard trust anchor and not be revoked. The
    algorithm is taken from the certificate, never from the caller.
    """
    document_bytes = await file.read()
    signature_bytes = decode_b64(signature, "signature")
    at_time = parse_iso_datetime(signed_at)
    try:
        info = pki_module.certificate_info(certificate)
    except pki_module.CertificateError as e:
        raise InputError(str(e))

    algorithm = info["algorithm"]
    if algorithm not in crypto_service.supported_algorithms:
        raise InputError(f"Certificate algorithm {algorithm} is not a supported post-quantum algorithm")

    try:
        status = (
            {"chain_valid": False, "revoked": None} if info["is_ca"]
            else pki_module.verify_certificate_chain(certificate, at_time)
        )
    except ca_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    signature_valid = crypto_service.verify_raw(
        document_bytes, signature_bytes, info["public_key_raw"], algorithm,
    )
    within_validity = info["not_before"] <= at_time <= info["not_after"] if at_time else None
    valid = (
        signature_valid and status["chain_valid"] and not status["revoked"]
        and within_validity is not False
    )
    return {
        "valid": valid,
        "signature_valid": signature_valid,
        "chain_valid": status["chain_valid"],
        "revoked": status["revoked"],
        "within_validity": within_validity,
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "algorithm": algorithm,
        "verification_timestamp": utc_now_iso(),
        "quantum_safe": True,
        "details": crypto_service.verification_details(algorithm),
        "certificate": pki_module.certificate_summary(info),
    }


@app.post("/crypto/verify-bundle",
          summary="Verify CMS signature (+ RFC 3161 time-stamp) of a signed bundle",
          tags=["PKI (X.509)"])
async def verify_bundle(
    file: UploadFile = File(..., description="Original document file"),
    cms_signature: str = Form(..., description="Base64 CMS SignedData (DER), i.e. signature.p7s"),
    timestamp_token: Optional[str] = Form(default=None, description="Base64 RFC 3161 TimeStampToken over the CMS"),
    signed_at: Optional[str] = Form(default=None, description="Signing time from the registry, if known"),
    require_hybrid: Optional[str] = Form(default=None, description="Fail unless an ECDSA signer is present"),
):
    """
    Verify every SignerInfo of the CMS (ML-DSA/SLH-DSA and, if hybrid, ECDSA),
    the certificate chains to the QuantumGuard root, revocation via CRLs, and
    the time-stamp. A verified time-stamp is used as the trusted signing time.
    """
    document_bytes = await file.read()
    cms_der = decode_b64(cms_signature, "cms_signature")
    token = decode_b64(timestamp_token, "timestamp_token") if timestamp_token else None
    try:
        stamp = tsa_module.maybe_verify_timestamp(token, cms_der)
        trusted_time = stamp["gen_time"] if stamp and stamp["valid"] else parse_iso_datetime(signed_at)
        check = pki_module.cms_verify_document(document_bytes, cms_der, at_time=trusted_time)
        if not check["cms_valid"] and trusted_time:
            # Distinguish "bad signature" from "cert outside validity at that time".
            loose = pki_module.cms_verify_document(document_bytes, cms_der)
            if loose["cms_valid"]:
                check = {**loose, "valid": False, "outside_validity": True}
    except ca_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))

    pq_signer = next((s for s in check["signers"] if s["post_quantum"]), None)
    hybrid = pq_signer is not None and any(not s["post_quantum"] for s in check["signers"])
    hybrid_missing = _form_bool(require_hybrid, False) and not hybrid
    stamp_invalid = stamp is not None and not stamp["valid"]
    valid = check["valid"] and not hybrid_missing and not stamp_invalid

    reason = None
    if check.get("outside_validity"):
        reason = "El certificado no estaba vigente en la fecha de firma"
    elif not check["cms_valid"]:
        reason = "El documento fue modificado o la firma no fue emitida por QuantumGuard"
    elif check["revoked"]:
        reason = "La firma fue revocada"
    elif pq_signer is None:
        reason = "La firma no contiene un firmante post-cuántico"
    elif hybrid_missing:
        reason = "Falta la firma clásica de la firma híbrida"
    elif stamp_invalid:
        reason = stamp["reason"]

    algorithm = pq_signer["algorithm"] if pq_signer else "desconocido"
    return {
        "valid": valid,
        "reason": reason,
        "cms_valid": check["cms_valid"],
        "revoked": check["revoked"],
        "hybrid": hybrid,
        "signers": [_signer_summary(s) for s in check["signers"]],
        "time_stamp": {
            "valid": stamp["valid"],
            "gen_time": stamp["gen_time"].isoformat() if stamp.get("gen_time") else None,
            "serial": stamp.get("serial"),
        } if stamp else None,
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "algorithm": algorithm,
        "verification_timestamp": utc_now_iso(),
        "quantum_safe": pq_signer is not None,
        "details": crypto_service.verification_details(algorithm) if pq_signer else {},
        "certificate": _signer_summary(pq_signer) if pq_signer else None,
    }


@app.post("/crypto/verify-cms",
          summary="Verify CMS SignedData",
          tags=["PKI (X.509)"])
async def verify_cms(
    file: UploadFile = File(..., description="Original document file"),
    cms_signature: str = Form(..., description="Base64-encoded CMS SignedData (DER)"),
):
    """Verify a detached CMS SignedData against the document and the QuantumGuard trust anchors"""
    document_bytes = await file.read()
    cms_der = decode_b64(cms_signature, "cms_signature")
    try:
        check = pki_module.cms_verify_document(document_bytes, cms_der)
    except ca_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "valid": check["valid"],
        "revoked": check["revoked"],
        "signers": [_signer_summary(s) for s in check["signers"]],
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "verification_timestamp": utc_now_iso(),
        "method": "CMS SignedData (RFC 9882 / RFC 9814)",
    }


@app.post("/crypto/pdf/verify",
          summary="Verify signatures embedded in a PDF",
          tags=["PDF"])
async def verify_pdf_embedded(file: UploadFile = File(..., description="Signed PDF")):
    pdf = await file.read()
    if not _is_pdf(pdf):
        raise InputError("File is not a PDF")
    try:
        result = pdf_sign.verify_pdf(pdf)
    except ca_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise InputError(f"Malformed PDF signature: {e}")
    return {**result, "document_hash": hashlib.sha3_256(pdf).hexdigest(), "verification_timestamp": utc_now_iso()}


@app.post("/crypto/pki/revoke",
          summary="Revoke a signer certificate",
          tags=["PKI (X.509)"])
async def revoke_certificate(
    certificate: str = Form(..., description="Certificate to revoke (PEM)"),
    reason: str = Form(default="unspecified", description="RFC 5280 revocation reason"),
):
    try:
        info = pki_module.certificate_info(certificate)
    except pki_module.CertificateError as e:
        raise InputError(str(e))
    if info["is_ca"]:
        raise InputError("CA certificates cannot be revoked through this endpoint")
    if reason not in ca_module.REVOCATION_REASONS:
        raise InputError(f"Unsupported reason. Supported: {', '.join(sorted(ca_module.REVOCATION_REASONS))}")
    try:
        if not pki_module.verify_certificate_chain(certificate)["chain_valid"]:
            raise InputError("Certificate was not issued by QuantumGuard")
        issuer = ca_module.authority_for_issuer(info["issuer"])
        if issuer is None:
            raise InputError("Issuing CA not found")
        ca_module.revoke_certificate(certificate, issuer, reason)
    except ca_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"revoked": True, "serial": info["serial"], "issuer": issuer.name, "reason": reason,
            "revoked_at": utc_now_iso()}


@app.get("/crypto/pki/ca",
         summary="Get CA Certificates",
         tags=["PKI (X.509)"])
async def get_ca_certificate():
    """QuantumGuard trust material (public): root, issuing CAs, TSA and the legacy CA"""
    try:
        issuing = {c: ca_module.certificate_pem(c) for c in ca_module.COUNTRIES}
        legacy = ca_module.certificate_pem("legacy") if os.path.exists(ca_module.legacy_ca().cert_path) else None
        return {
            "certificate_pem": ca_module.certificate_pem("root"),
            "root_pem": ca_module.certificate_pem("root"),
            "issuing_pem": issuing,
            "tsa_pem": ca_module.certificate_pem("tsa"),
            "legacy_pem": legacy,
            "openssl_version": pki_module.get_openssl_version(),
        }
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="PKI not initialized")


_PUBLIC_CA_NAMES = {"root", "legacy", "tsa", *ca_module.COUNTRIES}


@app.get("/crypto/pki/ca/{name}.crt", summary="Download a CA certificate (PEM)", tags=["PKI (X.509)"])
async def get_ca_file(name: str):
    if name not in _PUBLIC_CA_NAMES:
        raise HTTPException(status_code=404, detail="Unknown CA")
    try:
        return PlainTextResponse(ca_module.certificate_pem(name), media_type="application/x-pem-file")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Unknown CA")


@app.get("/crypto/pki/crl/{name}.crl", summary="Download a CRL (DER)", tags=["PKI (X.509)"])
async def get_crl(name: str):
    if name not in _PUBLIC_CA_NAMES - {"tsa"}:
        raise HTTPException(status_code=404, detail="Unknown CA")
    try:
        return Response(ca_module.crl_der(name), media_type="application/pkix-crl")
    except ca_module.PKIError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================================
# API Endpoints - PDF Visual Seal
# ============================================================

@app.post("/crypto/pdf/seal",
          summary="Add Visual Seal to Signed PDF",
          tags=["PDF Seal"])
async def add_pdf_seal(
    file: UploadFile = File(..., description="Signed PDF file"),
    algorithm: str = Form(default='ML-DSA-44', description="Signature algorithm used"),
    algorithm_display: str = Form(default='ML-DSA-44 (NIST Level 2)', description="Algorithm display name"),
    document_hash: str = Form(..., description="SHA-3-256 document hash"),
    signed_at: str = Form(..., description="Signing timestamp ISO"),
    valid_until: str = Form(..., description="Validity end timestamp ISO"),
    signature_id: str = Form(..., description="Signature UUID"),
    oid: str = Form(default='', description="Algorithm OID"),
    nist_standard: str = Form(default='FIPS 204', description="NIST standard"),
):
    """
    Add a visual post-quantum signature seal to a PDF.
    Returns the sealed PDF as binary (application/pdf).
    The original PDF is NOT modified — a new copy is created.
    """
    try:
        pdf_bytes = await file.read()

        if not file.filename or not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="File must be a PDF")

        sealed_pdf = pdf_seal.add_seal_to_pdf(
            pdf_bytes=pdf_bytes,
            algorithm=algorithm,
            algorithm_display=algorithm_display,
            document_hash=document_hash,
            signed_at=signed_at,
            valid_until=valid_until,
            signature_id=signature_id,
            oid=oid,
            nist_standard=nist_standard,
        )

        return Response(
            content=sealed_pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="sealed_{file.filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding PDF seal: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="info")

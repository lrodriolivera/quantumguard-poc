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
from datetime import datetime, timezone
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
        "url": "https://quantumguard.ai",
        "email": "support@quantumguard.ai"
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
    public_key: str
    secret_key: str
    algorithm: str
    public_key_size: int
    secret_key_size: int
    created_at: str
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

class QuantumKEMService:
    """Service for post-quantum Key Encapsulation Mechanism operations"""

    def __init__(self):
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

            return KEMKeypairResponse(
                public_key=base64.b64encode(public_key).decode(),
                secret_key=base64.b64encode(secret_key).decode(),
                algorithm=algorithm,
                public_key_size=len(public_key),
                secret_key_size=len(secret_key),
                created_at=utc_now_iso(),
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

    def decapsulate(self, ciphertext: str, secret_key: str, algorithm: str = 'ML-KEM-768') -> DecapsulationResponse:
        """Decapsulate: recover shared secret from ciphertext + secret key"""
        if algorithm not in self.supported_algorithms:
            raise InputError(f"Unsupported KEM algorithm: {algorithm}")
        try:

            oqs_alg = self.supported_algorithms[algorithm]
            sk_bytes = decode_b64(secret_key, 'secret_key')
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
    secret_key: str = Form(..., description="Base64-encoded secret key"),
    algorithm: str = Form(default='ML-KEM-768', description="KEM algorithm")
):
    """Decapsulate: recover the shared secret from ciphertext and secret key"""
    return kem_service.decapsulate(ciphertext, secret_key, algorithm)

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

import pki as pki_module
import pdf_seal

@app.on_event("startup")
async def startup_pki():
    """Load the PKI CA. A missing CA only gets created when PKI_AUTO_INIT_CA allows it."""
    allow_create = os.environ.get("PKI_AUTO_INIT_CA", "true").lower() == "true"
    try:
        logger.info(f"PKI: {pki_module.get_openssl_version()}")
        pki_module.init_ca(algorithm="ML-DSA-65", allow_create=allow_create)
        logger.info("PKI: Certificate Authority ready")
    except Exception as e:
        logger.error(f"PKI: Certificate Authority unavailable, signing disabled: {e}")


def _certificate_summary(info: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "subject": info["subject"],
        "issuer": info["issuer"],
        "serial": info["serial"],
        "common_name": info["common_name"],
        "email": info["email"],
        "not_before": info["not_before"].isoformat(),
        "not_after": info["not_after"].isoformat(),
        "algorithm": info["algorithm"],
    }


@app.post("/crypto/sign-x509",
          summary="Sign Document with X.509 Certificate + CMS",
          tags=["PKI (X.509)"])
async def sign_document_x509(
    file: UploadFile = File(..., description="Document file to sign"),
    algorithm: str = Form(default='ML-DSA-44', description="Signature algorithm"),
    signer_name: Optional[str] = Form(default=None, description="Signer display name (certificate CN)"),
    signer_email: Optional[str] = Form(default=None, description="Signer email (certificate SAN)"),
):
    """
    Sign a document with a CA-certified key bound to the signer's identity.

    One key produces every artifact: the raw detached signature (pure ML-DSA /
    SLH-DSA, FIPS 204/205), the CMS SignedData (RFC 9882 / RFC 9814) and the
    X.509 certificate (RFC 9881 / RFC 9909). The raw signature is cross-checked
    with liboqs before returning.
    """
    canonical = crypto_service.canonical(algorithm)
    document_bytes = await file.read()
    try:
        pki_result = pki_module.sign_document_full(
            document_bytes=document_bytes,
            algorithm=canonical,
            signer_name=signer_name,
            signer_email=signer_email,
        )
        if not crypto_service.verify_raw(
            document_bytes, pki_result["signature_raw"], pki_result["public_key_raw"], canonical,
        ):
            raise pki_module.PKIError("Self-check failed: liboqs rejected the OpenSSL signature")
    except pki_module.PKIError as e:
        logger.error(f"Error in sign_document_x509: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    cert = pki_result["certificate"]
    return {
        "signature_id": str(uuid.uuid4()),
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "signature": pki_module.b64(pki_result["signature_raw"]),
        "public_key": pki_module.b64(pki_result["public_key_raw"]),
        "algorithm": canonical,
        "timestamp": utc_now_iso(),
        "valid_until": cert["not_after"].isoformat(),
        "quantum_safe": True,
        "signature_size": len(pki_result["signature_raw"]),
        "pki": {
            "signer_cert_pem": pki_result["signer_cert_pem"],
            "ca_cert_pem": pki_result["ca_cert_pem"],
            "cms_signature_b64": pki_module.b64(pki_result["cms_der"]),
            "cms_size": len(pki_result["cms_der"]),
            "cms_digest": pki_result["cms_digest"],
            "oid": pki_result["oid"],
            "certificate": _certificate_summary(cert),
            "verified": True,
            "standards": (
                ["RFC 9909 (SLH-DSA in X.509)", "RFC 9814 (SLH-DSA in CMS)"]
                if canonical.startswith("SLH-DSA")
                else ["RFC 9881 (ML-DSA in X.509)", "RFC 9882 (ML-DSA in CMS)"]
            ),
        },
    }


@app.post("/crypto/verify-x509",
          summary="Verify Signature against a QuantumGuard Certificate",
          tags=["PKI (X.509)"])
async def verify_signature_x509(
    file: UploadFile = File(..., description="Original document file"),
    signature: str = Form(..., description="Base64-encoded raw signature"),
    certificate: str = Form(..., description="Signer certificate (PEM)"),
    signed_at: Optional[str] = Form(default=None, description="Trusted signing time (ISO-8601), if known"),
):
    """
    Verify a signature using only the key inside the signer certificate, and
    require that certificate to chain to the QuantumGuard CA. The algorithm is
    taken from the certificate, never from the caller.
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
        raise InputError(f"Certificate algorithm {algorithm} is not supported")

    try:
        chain_valid = not info["is_ca"] and pki_module.verify_certificate_chain(certificate)
    except pki_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    signature_valid = crypto_service.verify_raw(
        document_bytes, signature_bytes, info["public_key_raw"], algorithm,
    )
    within_validity = (
        info["not_before"] <= at_time <= info["not_after"] if at_time else None
    )
    valid = signature_valid and chain_valid and within_validity is not False

    return {
        "valid": valid,
        "signature_valid": signature_valid,
        "chain_valid": chain_valid,
        "within_validity": within_validity,
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "algorithm": algorithm,
        "verification_timestamp": utc_now_iso(),
        "quantum_safe": True,
        "details": crypto_service.verification_details(algorithm),
        "certificate": _certificate_summary(info),
    }


@app.post("/crypto/verify-cms",
          summary="Verify CMS SignedData",
          tags=["PKI (X.509)"])
async def verify_cms(
    file: UploadFile = File(..., description="Original document file"),
    cms_signature: str = Form(..., description="Base64-encoded CMS SignedData (DER)"),
):
    """Verify a detached CMS SignedData against the document and the QuantumGuard CA"""
    document_bytes = await file.read()
    cms_der = decode_b64(cms_signature, "cms_signature")
    try:
        is_valid = pki_module.cms_verify_document(document_bytes, cms_der)
    except pki_module.PKIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {
        "valid": is_valid,
        "document_hash": hashlib.sha3_256(document_bytes).hexdigest(),
        "verification_timestamp": utc_now_iso(),
        "method": "CMS SignedData (RFC 9882 / RFC 9814)",
    }

@app.get("/crypto/pki/ca",
         summary="Get CA Certificate",
         tags=["PKI (X.509)"])
async def get_ca_certificate():
    """Get the QuantumGuard PKI Certificate Authority certificate (public)"""
    ca_info = pki_module.get_ca_info()
    if not ca_info.get("initialized"):
        raise HTTPException(status_code=404, detail="PKI CA not initialized")
    return {
        "certificate_pem": ca_info["certificate_pem"],
        "details": ca_info["details"],
        "openssl_version": pki_module.get_openssl_version(),
    }

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

        from fastapi.responses import Response
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

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
from datetime import datetime, timedelta
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
    - 50-year validity period
    - SHA-3-256 document hashing
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
    valid_until: str
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
                'signature_size': 3293, 'public_key_size': 1952,
            },
            'ML-DSA-87': {
                'family': 'ML-DSA', 'standard': 'FIPS 204',
                'security_level': 5, 'type': 'lattice',
                'signature_size': 4595, 'public_key_size': 2592,
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

    def generate_keypair(self, algorithm: str = 'Dilithium2') -> KeypairResponse:
        """Generate a new quantum-safe keypair"""
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported algorithm: {algorithm}")

            oqs_algorithm = self.supported_algorithms[algorithm]
            signer = oqs.Signature(oqs_algorithm)
            public_key = signer.generate_keypair()

            return KeypairResponse(
                public_key=base64.b64encode(public_key).decode(),
                algorithm=algorithm,
                created_at=datetime.now().isoformat(),
                quantum_safe=True,
                key_size=len(public_key)
            )

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
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported algorithm: {algorithm}")

            # Calculate document hash using SHA-3-256 (quantum-resistant)
            document_hash = hashlib.sha3_256(document_bytes).hexdigest()

            oqs_algorithm = self.supported_algorithms[algorithm]
            signer = oqs.Signature(oqs_algorithm)
            public_key = signer.generate_keypair()
            signature_bytes = signer.sign(document_bytes)

            result = SignatureResponse(
                signature_id=str(uuid.uuid4()),
                document_hash=document_hash,
                signature=base64.b64encode(signature_bytes).decode(),
                public_key=base64.b64encode(public_key).decode(),
                algorithm=algorithm,
                timestamp=datetime.now().isoformat(),
                valid_until=(datetime.now() + timedelta(days=365*50)).isoformat(),
                quantum_safe=True,
                signature_size=len(signature_bytes)
            )

            logger.info(f"Document signed with {algorithm}. Hash: {document_hash[:16]}... Size: {len(signature_bytes)} bytes")
            return result

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
        """Verify a quantum-safe signature"""
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported algorithm: {algorithm}")

            signature_bytes = base64.b64decode(signature)
            public_key_bytes = base64.b64decode(public_key)

            oqs_algorithm = self.supported_algorithms[algorithm]
            verifier = oqs.Signature(oqs_algorithm)
            is_valid = verifier.verify(document_bytes, signature_bytes, public_key_bytes)

            document_hash = hashlib.sha3_256(document_bytes).hexdigest()
            meta = self.get_metadata(algorithm)

            return VerificationResponse(
                valid=is_valid,
                document_hash=document_hash,
                algorithm=algorithm,
                verification_timestamp=datetime.now().isoformat(),
                quantum_safe=True,
                details={
                    'algorithm_family': meta.get('family', 'Unknown'),
                    'nist_standard': meta.get('standard', 'Unknown'),
                    'security_level': f"NIST Level {meta.get('security_level', '?')}",
                    'algorithm_type': meta.get('type', 'unknown'),
                    'estimated_security_until': '2075+',
                }
            )

        except Exception as e:
            logger.error(f"Signature verification failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Signature verification failed: {str(e)}")

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
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported KEM algorithm: {algorithm}")

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
                created_at=datetime.now().isoformat(),
                quantum_safe=True,
            )

        except Exception as e:
            logger.error(f"KEM keypair generation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"KEM keypair generation failed: {str(e)}")

    def encapsulate(self, public_key: str, algorithm: str = 'ML-KEM-768') -> EncapsulationResponse:
        """Encapsulate: generate shared secret + ciphertext from public key"""
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported KEM algorithm: {algorithm}")

            oqs_alg = self.supported_algorithms[algorithm]
            kem = oqs.KeyEncapsulation(oqs_alg)
            pk_bytes = base64.b64decode(public_key)
            ciphertext, shared_secret = kem.encap_secret(pk_bytes)

            return EncapsulationResponse(
                ciphertext=base64.b64encode(ciphertext).decode(),
                shared_secret=base64.b64encode(shared_secret).decode(),
                algorithm=algorithm,
                ciphertext_size=len(ciphertext),
                shared_secret_size=len(shared_secret),
                timestamp=datetime.now().isoformat(),
                quantum_safe=True,
            )

        except Exception as e:
            logger.error(f"KEM encapsulation failed: {str(e)}")
            raise HTTPException(status_code=500, detail=f"KEM encapsulation failed: {str(e)}")

    def decapsulate(self, ciphertext: str, secret_key: str, algorithm: str = 'ML-KEM-768') -> DecapsulationResponse:
        """Decapsulate: recover shared secret from ciphertext + secret key"""
        try:
            if algorithm not in self.supported_algorithms:
                raise ValueError(f"Unsupported KEM algorithm: {algorithm}")

            oqs_alg = self.supported_algorithms[algorithm]
            sk_bytes = base64.b64decode(secret_key)
            kem = oqs.KeyEncapsulation(oqs_alg, secret_key=sk_bytes)
            ct_bytes = base64.b64decode(ciphertext)
            shared_secret = kem.decap_secret(ct_bytes)

            return DecapsulationResponse(
                shared_secret=base64.b64encode(shared_secret).decode(),
                algorithm=algorithm,
                shared_secret_size=len(shared_secret),
                timestamp=datetime.now().isoformat(),
                quantum_safe=True,
            )

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
        "timestamp": datetime.now().isoformat(),
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
    """Initialize the PKI Certificate Authority on startup"""
    try:
        openssl_ver = pki_module.get_openssl_version()
        logger.info(f"PKI: {openssl_ver}")
        ca_info = pki_module.init_ca(algorithm="ML-DSA-65")
        if ca_info.get("initialized"):
            logger.info("PKI: Certificate Authority ready")
        else:
            logger.warning("PKI: CA initialization returned unexpected state")
    except Exception as e:
        logger.warning(f"PKI: Could not initialize CA (OpenSSL 3.5 may not be available): {e}")

@app.post("/crypto/sign-x509",
          summary="Sign Document with X.509 Certificate + CMS",
          tags=["PKI (X.509)"])
async def sign_document_x509(
    file: UploadFile = File(..., description="Document file to sign"),
    algorithm: str = Form(default='ML-DSA-44', description="Signature algorithm"),
):
    """
    Sign a document and generate RFC-compliant PKI artifacts:
    - liboqs quantum signature (fast)
    - X.509 end-entity certificate (RFC 9881)
    - CMS SignedData detached signature (RFC 9882)
    - CA certificate for verification
    """
    try:
        document_bytes = await file.read()

        # 1. Fast signature via liboqs (existing flow)
        liboqs_result = crypto_service.sign_document(document_bytes, algorithm)

        # 2. PKI artifacts via OpenSSL 3.5
        pki_result = pki_module.sign_document_full(
            document_bytes=document_bytes,
            algorithm=algorithm,
        )

        return {
            # liboqs signature data
            "signature_id": liboqs_result.signature_id,
            "document_hash": liboqs_result.document_hash,
            "signature": liboqs_result.signature,
            "public_key": liboqs_result.public_key,
            "algorithm": liboqs_result.algorithm,
            "timestamp": liboqs_result.timestamp,
            "valid_until": liboqs_result.valid_until,
            "quantum_safe": True,
            "signature_size": liboqs_result.signature_size,
            # PKI artifacts
            "pki": {
                "signer_cert_pem": pki_result["signer_cert_pem"],
                "ca_cert_pem": pki_result["ca_cert_pem"],
                "cms_signature_b64": pki_result["cms_signature_b64"],
                "cms_size": pki_result["cms_size"],
                "oid": pki_result["oid"],
                "verified": pki_result["verified"],
                "standards": ["RFC 9881 (ML-DSA in X.509)", "RFC 9882 (ML-DSA in CMS)"],
            },
        }

    except Exception as e:
        logger.error(f"Error in sign_document_x509: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/crypto/verify-cms",
          summary="Verify CMS SignedData",
          tags=["PKI (X.509)"])
async def verify_cms(
    file: UploadFile = File(..., description="Original document file"),
    cms_signature: str = Form(..., description="Base64-encoded CMS SignedData (DER)"),
):
    """Verify a CMS SignedData detached signature against the original document"""
    try:
        document_bytes = await file.read()
        cms_der = base64.b64decode(cms_signature)
        ca_info = pki_module.get_ca_info()

        if not ca_info.get("initialized"):
            raise HTTPException(status_code=500, detail="PKI CA not initialized")

        is_valid = pki_module.cms_verify_document(
            document_bytes=document_bytes,
            cms_signature_der=cms_der,
            ca_cert_pem=ca_info["certificate_pem"],
        )

        return {
            "valid": is_valid,
            "verification_timestamp": datetime.now().isoformat(),
            "method": "CMS SignedData (RFC 9882)",
        }

    except Exception as e:
        logger.error(f"Error in verify_cms: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

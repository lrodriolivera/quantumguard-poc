"""
QuantumGuard AI - Certificate Authority hierarchy

  QuantumGuard Post-Quantum Root CA (ML-DSA-87)
   ├── QuantumGuard CA Chile    (ML-DSA-65, C=CL)  -> signer certificates
   ├── QuantumGuard CA Colombia (ML-DSA-65, C=CO)  -> signer certificates
   ├── QuantumGuard CA España   (ML-DSA-65, C=ES)  -> signer certificates
   └── QuantumGuard TSA         (ML-DSA-65, EKU timeStamping)

The pre-hierarchy CA (C=PY, PKI_DIR/ca.crt) stays trusted so signatures it
issued keep verifying, and it gets its own CRL for revocation.

Private keys are stored as encrypted PKCS#8 (AES-256, PBKDF2); the passphrase
comes from PKI_KEY_PASSPHRASE, which must live outside the PKI volume.
"""

import fcntl
import logging
import os
import subprocess
import tempfile
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

OPENSSL_BIN = os.environ.get("OPENSSL_BIN", "/opt/openssl/bin/openssl")
PKI_DIR = os.environ.get("PKI_DIR", "/app/pki")
PASSPHRASE_ENV = "PKI_KEY_PASSPHRASE"
PUBLIC_BASE_URL = os.environ.get("PKI_PUBLIC_BASE_URL", "https://app.postcuantica.io").rstrip("/")
PKI_ORG = "Post Cuantica Lab"
PKI_OU = "QuantumGuard AI"
CRL_DAYS = 7
CRL_REFRESH_AFTER = timedelta(days=1)

COUNTRIES: Dict[str, str] = {"CL": "Chile", "CO": "Colombia", "ES": "España"}
DEFAULT_COUNTRY = "CL"

REVOCATION_REASONS = {
    "unspecified", "keyCompromise", "affiliationChanged",
    "superseded", "cessationOfOperation", "certificateHold",
}


class PKIError(RuntimeError):
    """Server-side PKI failure (OpenSSL error, missing CA, missing passphrase)."""


@dataclass(frozen=True)
class CertificateAuthority:
    name: str  # "root", "CL", "CO", "ES", "legacy"
    directory: str
    cert_path: str
    key_path: str

    @property
    def index_path(self) -> str:
        return os.path.join(self.directory, "db", "index.txt")

    @property
    def crlnumber_path(self) -> str:
        return os.path.join(self.directory, "db", "crlnumber")

    @property
    def crl_path(self) -> str:
        return os.path.join(self.directory, "db", "crl.pem")

    @property
    def crl_url(self) -> str:
        return f"{PUBLIC_BASE_URL}/api/pki/crl/{self.name}.crl"

    @property
    def cert_url(self) -> str:
        return f"{PUBLIC_BASE_URL}/api/pki/ca/{self.name}.crt"


def _authority(name: str) -> CertificateAuthority:
    if name == "legacy":
        return CertificateAuthority(
            "legacy", PKI_DIR, os.path.join(PKI_DIR, "ca.crt"), os.path.join(PKI_DIR, "ca.key.enc"),
        )
    directory = os.path.join(PKI_DIR, "root" if name == "root" else os.path.join("issuing", name))
    return CertificateAuthority(
        name, directory, os.path.join(directory, "ca.crt"), os.path.join(directory, "ca.key.enc"),
    )


def root_ca() -> CertificateAuthority:
    return _authority("root")


def legacy_ca() -> CertificateAuthority:
    return _authority("legacy")


def issuing_ca(country: str) -> CertificateAuthority:
    if country not in COUNTRIES:
        raise ValueError(f"Unsupported country: {country}. Supported: {', '.join(COUNTRIES)}")
    return _authority(country)


def tsa_paths() -> Dict[str, str]:
    directory = os.path.join(PKI_DIR, "tsa")
    return {
        "dir": directory,
        "cert": os.path.join(directory, "tsa.crt"),
        "key": os.path.join(directory, "tsa.key.enc"),
    }


def all_authorities() -> List[CertificateAuthority]:
    cas = [root_ca(), *(issuing_ca(c) for c in COUNTRIES)]
    if os.path.exists(legacy_ca().cert_path):
        cas.append(legacy_ca())
    return cas


# ------------------------------------------------------------
# OpenSSL plumbing
# ------------------------------------------------------------

def run_openssl(*args, check: bool = True, env_passphrase: bool = False) -> subprocess.CompletedProcess:
    env = None
    if env_passphrase:
        if not os.environ.get(PASSPHRASE_ENV):
            raise PKIError(f"{PASSPHRASE_ENV} is not set; CA private keys cannot be unlocked")
        env = os.environ.copy()
    result = subprocess.run([OPENSSL_BIN, *args], capture_output=True, timeout=120, env=env)
    if check and result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise PKIError(f"OpenSSL {args[0]} failed: {stderr}")
    return result


PASSIN = ["-passin", f"env:{PASSPHRASE_ENV}"]
PASSOUT = ["-passout", f"env:{PASSPHRASE_ENV}"]


_lock_state = threading.local()


@contextmanager
def pki_lock():
    """Re-entrant exclusive lock serialising writes to CA databases and CRLs."""
    depth = getattr(_lock_state, "depth", 0)
    _lock_state.depth = depth + 1
    try:
        if depth:
            yield
            return
        os.makedirs(PKI_DIR, exist_ok=True)
        with open(os.path.join(PKI_DIR, ".lock"), "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)
    finally:
        _lock_state.depth = depth


def _write_private(path: str, content: str) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(content)


def _ext_config(sections: Dict[str, List[str]]) -> str:
    return "".join(f"[{name}]\n" + "".join(f"{line}\n" for line in lines) for name, lines in sections.items())


def _new_encrypted_key(algorithm: str, path: str) -> None:
    run_openssl("genpkey", "-algorithm", algorithm, "-aes-256-cbc", "-pass", f"env:{PASSPHRASE_ENV}", "-out", path, env_passphrase=True)
    os.chmod(path, 0o600)


def _serial() -> str:
    import secrets
    return "0x" + format(secrets.randbits(127) | (1 << 126), "x")


# ------------------------------------------------------------
# Hierarchy lifecycle
# ------------------------------------------------------------

def _init_ca_db(ca: CertificateAuthority) -> None:
    os.makedirs(os.path.dirname(ca.index_path), exist_ok=True)
    if not os.path.exists(ca.index_path):
        open(ca.index_path, "w").close()
    if not os.path.exists(ca.crlnumber_path):
        with open(ca.crlnumber_path, "w") as f:
            f.write("1000\n")


def _create_root() -> None:
    ca = root_ca()
    os.makedirs(ca.directory, exist_ok=True)
    _new_encrypted_key("mldsa87", ca.key_path)
    run_openssl(
        "req", "-x509", "-new", "-utf8", "-key", ca.key_path, *PASSIN,
        "-subj", f"/O={PKI_ORG}/OU={PKI_OU}/CN=QuantumGuard Post-Quantum Root CA",
        "-days", str(365 * 25),
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,keyCertSign,cRLSign",
        "-addext", "subjectKeyIdentifier=hash",
        "-out", ca.cert_path,
        env_passphrase=True,
    )


def _issue_from_root(subject: str, key_path: str, out_path: str, days: int, extensions: List[str]) -> None:
    root = root_ca()
    with tempfile.TemporaryDirectory() as tmp:
        csr = os.path.join(tmp, "req.csr")
        cfg = os.path.join(tmp, "ext.cnf")
        with open(cfg, "w") as f:
            f.write(_ext_config({"ext": extensions}))
        run_openssl("req", "-new", "-utf8", "-key", key_path, *PASSIN, "-subj", subject, "-out", csr, env_passphrase=True)
        run_openssl(
            "x509", "-req", "-in", csr, "-CA", root.cert_path, "-CAkey", root.key_path, *PASSIN,
            "-set_serial", _serial(), "-days", str(days),
            "-extfile", cfg, "-extensions", "ext", "-out", out_path,
            env_passphrase=True,
        )


def _create_issuing(country: str) -> None:
    ca = issuing_ca(country)
    os.makedirs(ca.directory, exist_ok=True)
    _new_encrypted_key("mldsa65", ca.key_path)
    _issue_from_root(
        f"/C={country}/O={PKI_ORG}/OU={PKI_OU}/CN=QuantumGuard CA {COUNTRIES[country]}",
        ca.key_path, ca.cert_path, 365 * 12,
        [
            "basicConstraints=critical,CA:TRUE,pathlen:0",
            "keyUsage=critical,keyCertSign,cRLSign",
            "subjectKeyIdentifier=hash",
            "authorityKeyIdentifier=keyid,issuer",
            f"crlDistributionPoints=URI:{root_ca().crl_url}",
            f"authorityInfoAccess=caIssuers;URI:{root_ca().cert_url}",
        ],
    )


def _create_tsa() -> None:
    paths = tsa_paths()
    os.makedirs(paths["dir"], exist_ok=True)
    _new_encrypted_key("mldsa65", paths["key"])
    _issue_from_root(
        f"/O={PKI_ORG}/OU={PKI_OU}/CN=QuantumGuard Time Stamping Authority",
        paths["key"], paths["cert"], 365 * 12,
        [
            "basicConstraints=critical,CA:FALSE",
            "keyUsage=critical,digitalSignature",
            "extendedKeyUsage=critical,timeStamping",
            "subjectKeyIdentifier=hash",
            "authorityKeyIdentifier=keyid,issuer",
            f"crlDistributionPoints=URI:{root_ca().crl_url}",
        ],
    )


def _encrypt_legacy_key() -> None:
    """Replace the plaintext pre-hierarchy CA key with an encrypted copy."""
    plain = os.path.join(PKI_DIR, "ca.key")
    target = legacy_ca().key_path
    if not os.path.exists(plain):
        return
    tmp = target + ".tmp"
    run_openssl("pkey", "-in", plain, "-aes-256-cbc", *PASSOUT, "-out", tmp, env_passphrase=True)
    os.chmod(tmp, 0o600)
    run_openssl("pkey", "-in", tmp, *PASSIN, "-noout", env_passphrase=True)
    os.replace(tmp, target)
    os.remove(plain)
    logger.warning("PKI: legacy CA key encrypted at rest; plaintext copy removed from the volume")


def hierarchy_status() -> Dict[str, bool]:
    status = {"root": os.path.exists(root_ca().cert_path) and os.path.exists(root_ca().key_path)}
    for country in COUNTRIES:
        ca = issuing_ca(country)
        status[country] = os.path.exists(ca.cert_path) and os.path.exists(ca.key_path)
    status["tsa"] = os.path.exists(tsa_paths()["cert"]) and os.path.exists(tsa_paths()["key"])
    return status


def ensure_hierarchy(allow_create: bool) -> Dict[str, bool]:
    """Load the hierarchy, creating missing parts only when allowed.

    A missing root in production means a lost volume; minting a new root would
    orphan every certificate already issued, so that case fails loudly.
    """
    if not os.environ.get(PASSPHRASE_ENV):
        raise PKIError(f"{PASSPHRASE_ENV} is not set")
    with pki_lock():
        _encrypt_legacy_key()
        status = hierarchy_status()
        missing = [name for name, present in status.items() if not present]
        if missing and not allow_create:
            raise PKIError(
                f"PKI components missing: {', '.join(missing)}. "
                "Run `python pki_admin.py init` once, or restore the PKI volume from backup."
            )
        if not status["root"]:
            if any(status[c] for c in COUNTRIES) or status["tsa"]:
                raise PKIError("Root CA missing but subordinate CAs exist: restore the PKI volume from backup")
            logger.warning("PKI: creating NEW root CA")
            _create_root()
        for country in COUNTRIES:
            if not status[country]:
                logger.warning(f"PKI: creating issuing CA for {country}")
                _create_issuing(country)
        if not status["tsa"]:
            logger.warning("PKI: creating TSA certificate")
            _create_tsa()
        for ca in all_authorities():
            _init_ca_db(ca)
        refresh_crls(force=False)
        return hierarchy_status()


# ------------------------------------------------------------
# Trust material
# ------------------------------------------------------------

def _read(path: str) -> str:
    with open(path, "r") as f:
        return f.read()


def trust_anchors_path() -> str:
    """PEM bundle of trust anchors (root + legacy CA) for -CAfile."""
    path = os.path.join(PKI_DIR, "trust-anchors.pem")
    pems = [_read(root_ca().cert_path)]
    if os.path.exists(legacy_ca().cert_path):
        pems.append(_read(legacy_ca().cert_path))
    _write_if_changed(path, "".join(pems))
    return path


def intermediates_path() -> str:
    path = os.path.join(PKI_DIR, "intermediates.pem")
    _write_if_changed(path, "".join(_read(issuing_ca(c).cert_path) for c in COUNTRIES))
    return path


def crl_bundle_path() -> str:
    refresh_crls(force=False)
    path = os.path.join(PKI_DIR, "crls.pem")
    _write_if_changed(path, "".join(_read(ca.crl_path) for ca in all_authorities() if os.path.exists(ca.crl_path)))
    return path


def _write_if_changed(path: str, content: str) -> None:
    if os.path.exists(path) and _read(path) == content:
        return
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(content)
    os.replace(tmp, path)


def certificate_pem(name: str) -> str:
    if name == "tsa":
        return _read(tsa_paths()["cert"])
    ca = _authority(name) if name in ("root", "legacy") else issuing_ca(name)
    return _read(ca.cert_path)


def authority_for_issuer(issuer_cert_subject: str) -> Optional[CertificateAuthority]:
    for ca in all_authorities():
        result = run_openssl("x509", "-in", ca.cert_path, "-noout", "-subject", "-nameopt", "RFC2253,-esc_msb")
        if result.stdout.decode().strip().removeprefix("subject=").strip() == issuer_cert_subject:
            return ca
    return None


# ------------------------------------------------------------
# Revocation (openssl ca database + CRL per authority)
# ------------------------------------------------------------

def _ca_config(ca: CertificateAuthority) -> str:
    return _ext_config({
        "ca": ["default_ca = qg"],
        "qg": [
            f"database = {ca.index_path}",
            f"crlnumber = {ca.crlnumber_path}",
            f"certificate = {ca.cert_path}",
            f"private_key = {ca.key_path}",
            "default_md = default",
            f"default_crl_days = {CRL_DAYS}",
            "unique_subject = no",
            "crl_extensions = crl_ext",
        ],
        "crl_ext": ["authorityKeyIdentifier = keyid:always"],
    })


def _gencrl(ca: CertificateAuthority) -> None:
    _init_ca_db(ca)
    with tempfile.TemporaryDirectory() as tmp:
        cfg = os.path.join(tmp, "ca.cnf")
        with open(cfg, "w") as f:
            f.write(_ca_config(ca))
        out = ca.crl_path + ".tmp"
        run_openssl("ca", "-config", cfg, *PASSIN, "-gencrl", "-out", out, env_passphrase=True)
        os.replace(out, ca.crl_path)


def refresh_crls(force: bool = False) -> None:
    with pki_lock():
        _refresh_crls(force)


def _refresh_crls(force: bool) -> None:
    now = datetime.now(timezone.utc)
    for ca in all_authorities():
        if not os.path.exists(ca.key_path):
            continue
        if not force and os.path.exists(ca.crl_path):
            age = now - datetime.fromtimestamp(os.path.getmtime(ca.crl_path), timezone.utc)
            if age < CRL_REFRESH_AFTER:
                continue
        _gencrl(ca)


def revoke_certificate(cert_pem: str, issuer: CertificateAuthority, reason: str) -> None:
    if reason not in REVOCATION_REASONS:
        raise ValueError(f"Unsupported revocation reason: {reason}")
    with pki_lock(), tempfile.TemporaryDirectory() as tmp:
        cfg = os.path.join(tmp, "ca.cnf")
        cert = os.path.join(tmp, "cert.pem")
        with open(cfg, "w") as f:
            f.write(_ca_config(issuer))
        with open(cert, "w") as f:
            f.write(cert_pem)
        _init_ca_db(issuer)
        result = run_openssl(
            "ca", "-config", cfg, *PASSIN, "-revoke", cert, "-crl_reason", reason,
            check=False, env_passphrase=True,
        )
        stderr = result.stderr.decode("utf-8", errors="replace")
        if result.returncode != 0 and "Already revoked" not in stderr:
            raise PKIError(f"Revocation failed: {stderr.strip()}")
        _gencrl(issuer)


def crl_der(name: str) -> bytes:
    ca = _authority(name) if name in ("root", "legacy") else issuing_ca(name)
    refresh_crls(force=False)
    if not os.path.exists(ca.crl_path):
        raise PKIError(f"No CRL for {name}")
    return run_openssl("crl", "-in", ca.crl_path, "-outform", "DER").stdout

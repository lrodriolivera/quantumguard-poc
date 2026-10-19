"""Test environment: isolated PKI dir with a pre-hierarchy CA like production's."""

import os
import subprocess
import tempfile

PKI_TMP = tempfile.mkdtemp(prefix="qg-pki-")
os.environ["PKI_DIR"] = PKI_TMP
os.environ["PKI_KEY_PASSPHRASE"] = "test-passphrase"
os.environ.pop("CRYPTO_SERVICE_TOKEN", None)

subprocess.run(
    ["/opt/openssl/bin/openssl", "req", "-x509", "-newkey", "mldsa65", "-nodes",
     "-keyout", f"{PKI_TMP}/ca.key", "-out", f"{PKI_TMP}/ca.crt",
     "-subj", "/C=PY/O=Post Cuantica Lab/CN=QuantumGuard Post-Quantum CA", "-days", "3650"],
    capture_output=True, check=True,
)

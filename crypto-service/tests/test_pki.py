"""
Regression tests for the PKI signing/verification flow.
Run inside the crypto-service image (needs OpenSSL 3.5+ and liboqs):
  docker run --rm -v $PWD/tests:/app/tests:ro --entrypoint sh <image> \
    -c "pip install -q pytest && PKI_DIR=/tmp/pki python -m pytest -q tests"
"""

import base64
import os
import subprocess
import tempfile

import oqs
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("PKI_DIR", tempfile.mkdtemp(prefix="qg-pki-"))

import main  # noqa: E402
import pki  # noqa: E402

DOC = b"Contrato de prueba QuantumGuard: pagar 100 EUR"
ALL_ALGORITHMS = list(pki.ALGORITHMS)


@pytest.fixture(scope="module")
def client():
    pki.init_ca(algorithm="ML-DSA-65", allow_create=True)
    with TestClient(main.app) as c:
        yield c


def sign(client, algorithm="ML-DSA-44", doc=DOC, name="Rene Carreño", email="rene@example.com"):
    r = client.post(
        "/crypto/sign-x509",
        files={"file": ("doc.txt", doc)},
        data={"algorithm": algorithm, "signer_name": name, "signer_email": email},
    )
    assert r.status_code == 200, r.text
    return r.json()


def verify_x509(client, signature, certificate, doc=DOC, signed_at=None):
    data = {"signature": signature, "certificate": certificate}
    if signed_at:
        data["signed_at"] = signed_at
    return client.post("/crypto/verify-x509", files={"file": ("doc.txt", doc)}, data=data)


def openssl(*args, check=True):
    return subprocess.run([pki.OPENSSL_BIN, *args], capture_output=True, check=check)


@pytest.mark.parametrize("algorithm", ALL_ALGORITHMS)
def test_sign_and_verify_roundtrip_every_algorithm(client, algorithm):
    signed = sign(client, algorithm)
    r = verify_x509(client, signed["signature"], signed["pki"]["signer_cert_pem"])
    body = r.json()
    assert r.status_code == 200
    assert body["valid"] and body["signature_valid"] and body["chain_valid"]
    assert body["algorithm"] == algorithm
    assert signed["pki"]["certificate"]["algorithm"] == algorithm


@pytest.mark.parametrize("algorithm", ALL_ALGORITHMS)
def test_public_key_is_the_certificate_key(client, algorithm):
    signed = sign(client, algorithm)
    info = pki.certificate_info(signed["pki"]["signer_cert_pem"])
    assert base64.b64decode(signed["public_key"]) == info["public_key_raw"]
    assert len(info["public_key_raw"]) == pki.ALGORITHMS[algorithm].public_key_size


def test_tampered_document_fails(client):
    signed = sign(client)
    r = verify_x509(client, signed["signature"], signed["pki"]["signer_cert_pem"], doc=DOC + b"0")
    assert r.status_code == 200
    assert r.json()["valid"] is False


def test_forgery_with_attacker_key_and_self_signed_cert_is_rejected(client):
    forged_doc = b"Contrato: Rene debe 1.000.000 USD"
    with tempfile.TemporaryDirectory() as d:
        key, crt, doc, sig = (os.path.join(d, n) for n in ("k.pem", "c.pem", "doc", "sig"))
        openssl("req", "-x509", "-newkey", "mldsa44", "-nodes", "-keyout", key, "-out", crt,
                "-subj", "/CN=QuantumGuard Document Signer", "-days", "30")
        with open(doc, "wb") as f:
            f.write(forged_doc)
        openssl("pkeyutl", "-sign", "-rawin", "-inkey", key, "-in", doc, "-out", sig)
        with open(sig, "rb") as f:
            forged_sig = base64.b64encode(f.read()).decode()
        with open(crt) as f:
            forged_cert = f.read()
    body = verify_x509(client, forged_sig, forged_cert, doc=forged_doc).json()
    assert body["signature_valid"] is True
    assert body["chain_valid"] is False
    assert body["valid"] is False


def test_ca_certificate_cannot_be_used_as_signer(client):
    ca_pem = pki.get_ca_info()["certificate_pem"]
    signed = sign(client)
    body = verify_x509(client, signed["signature"], ca_pem).json()
    assert body["valid"] is False and body["chain_valid"] is False


def test_signature_from_other_document_fails(client):
    a = sign(client, doc=b"documento A")
    b = sign(client, doc=b"documento B")
    body = verify_x509(client, a["signature"], b["pki"]["signer_cert_pem"], doc=b"documento A").json()
    assert body["valid"] is False


def test_signing_time_outside_certificate_validity_is_invalid(client):
    signed = sign(client)
    body = verify_x509(
        client, signed["signature"], signed["pki"]["signer_cert_pem"], signed_at="2001-01-01T00:00:00Z",
    ).json()
    assert body["signature_valid"] is True
    assert body["within_validity"] is False
    assert body["valid"] is False


def test_certificate_carries_signer_identity(client):
    signed = sign(client, name="Rene Carreño", email="rene@example.com")
    cert = signed["pki"]["certificate"]
    assert cert["common_name"] == "Rene Carreño"
    assert cert["email"] == "rene@example.com"


def test_identity_is_sanitized_against_config_injection(client):
    signed = sign(client, name="Eve $ENV::HOME\n[ext]\nbasicConstraints=CA:TRUE", email="not-an-email")
    info = pki.certificate_info(signed["pki"]["signer_cert_pem"])
    assert info["is_ca"] is False
    assert info["email"] is None
    assert "$" not in info["common_name"] and "\n" not in info["common_name"]


@pytest.mark.parametrize("algorithm", ALL_ALGORITHMS)
def test_cms_is_real_signed_data_verifiable_with_openssl(client, algorithm):
    signed = sign(client, algorithm)
    cms_der = base64.b64decode(signed["pki"]["cms_signature_b64"])
    with tempfile.TemporaryDirectory() as d:
        p7s, doc, ca = (os.path.join(d, n) for n in ("s.p7s", "doc", "ca.pem"))
        with open(p7s, "wb") as f:
            f.write(cms_der)
        with open(doc, "wb") as f:
            f.write(DOC)
        with open(ca, "w") as f:
            f.write(signed["pki"]["ca_cert_pem"])
        ok = openssl("cms", "-verify", "-binary", "-inform", "DER", "-in", p7s, "-content", doc,
                     "-CAfile", ca, "-purpose", "any", "-out", os.devnull, check=False)
        assert ok.returncode == 0, ok.stderr
        with open(doc, "wb") as f:
            f.write(DOC + b"!")
        bad = openssl("cms", "-verify", "-binary", "-inform", "DER", "-in", p7s, "-content", doc,
                      "-CAfile", ca, "-purpose", "any", "-out", os.devnull, check=False)
        assert bad.returncode != 0


def test_verify_cms_endpoint(client):
    signed = sign(client)
    cms = signed["pki"]["cms_signature_b64"]
    ok = client.post("/crypto/verify-cms", files={"file": ("d", DOC)}, data={"cms_signature": cms})
    bad = client.post("/crypto/verify-cms", files={"file": ("d", DOC + b"x")}, data={"cms_signature": cms})
    assert ok.status_code == 200 and ok.json()["valid"] is True
    assert bad.status_code == 200 and bad.json()["valid"] is False


def test_raw_signature_interoperates_with_liboqs(client):
    signed = sign(client, "ML-DSA-65")
    with oqs.Signature("ML-DSA-65") as v:
        assert v.verify(DOC, base64.b64decode(signed["signature"]), base64.b64decode(signed["public_key"]))


def test_aliases_are_canonicalized(client):
    assert sign(client, "Dilithium2")["algorithm"] == "ML-DSA-44"


@pytest.mark.parametrize("path,data", [
    ("/crypto/sign-x509", {"algorithm": "RSA-2048"}),
    ("/crypto/verify", {"signature": "!!!", "public_key": "AAAA", "algorithm": "ML-DSA-44"}),
    ("/crypto/verify", {"signature": "AAAA", "public_key": "AAAA", "algorithm": "ML-DSA-44"}),
    ("/crypto/verify", {"signature": "AAAA", "public_key": "AAAA", "algorithm": "Nope"}),
    ("/crypto/verify-x509", {"signature": "AAAA", "certificate": "not a cert"}),
    ("/crypto/verify-cms", {"cms_signature": "%%%"}),
])
def test_invalid_input_returns_400(client, path, data):
    r = client.post(path, files={"file": ("d", DOC)}, data=data)
    assert r.status_code == 400, r.text


def test_verify_with_mismatched_algorithm_key_is_400(client):
    signed = sign(client, "ML-DSA-65")
    r = client.post("/crypto/verify", files={"file": ("d", DOC)},
                    data={"signature": signed["signature"], "public_key": signed["public_key"],
                          "algorithm": "ML-DSA-44"})
    assert r.status_code == 400


def test_metadata_sizes_match_fips(client):
    algs = client.get("/crypto/algorithms").json()["algorithms"]
    assert algs["ML-DSA-65"]["signature_size_bytes"] == 3309
    assert algs["ML-DSA-87"]["signature_size_bytes"] == 4627


def test_init_ca_refuses_to_create_when_disabled(tmp_path, monkeypatch):
    monkeypatch.setattr(pki, "PKI_DIR", str(tmp_path / "empty"))
    with pytest.raises(pki.PKIError):
        pki.init_ca(allow_create=False)
    assert not (tmp_path / "empty" / "ca.key").exists()

#!/bin/sh
# Starts the crypto-service, over TLS when TLS_ENABLED=true. The self-signed
# server certificate is pinned by the backend through the shared public volume.
set -eu

if [ "${TLS_ENABLED:-false}" = "true" ]; then
  TLS_DIR=/app/pki/internal-tls
  PUBLIC_DIR=/app/tls-public
  mkdir -p "$TLS_DIR"
  if [ ! -f "$TLS_DIR/server.key" ] || ! openssl x509 -in "$TLS_DIR/server.crt" -noout -checkend 2592000 >/dev/null 2>&1; then
    umask 077
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
      -keyout "$TLS_DIR/server.key" -out "$TLS_DIR/server.crt" -days 1825 \
      -subj "/O=Post Cuantica Lab/CN=crypto-service" \
      -addext "subjectAltName=DNS:crypto-service,DNS:localhost,IP:127.0.0.1" \
      -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
      -addext "keyUsage=critical,digitalSignature,keyCertSign" \
      -addext "extendedKeyUsage=serverAuth" >/dev/null 2>&1
  fi
  cp "$TLS_DIR/server.crt" "$PUBLIC_DIR/server.crt.tmp" && mv "$PUBLIC_DIR/server.crt.tmp" "$PUBLIC_DIR/server.crt"
  exec uvicorn main:app --host 0.0.0.0 --port 8001 \
    --ssl-keyfile "$TLS_DIR/server.key" --ssl-certfile "$TLS_DIR/server.crt"
fi

exec uvicorn main:app --host 0.0.0.0 --port 8001

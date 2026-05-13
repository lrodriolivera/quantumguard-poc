# Verificacion de Firma Post-Cuantica
## QuantumGuard AI - Post Cuantica Lab

### Verificar con OpenSSL 3.5+
```bash
openssl cms -verify \
  -in signature.p7s \
  -content 10 Preguntas EstratÃ©gicas RYP - Foro LicitaciÃ³n ChileCompra.pdf \
  -CAfile ca_certificate.pem \
  -inform DER \
  -binary \
  -purpose any
```

### Informacion
- **Algoritmo:** SLH-DSA-SHA2-256s (SLH-DSA-SHA2-256s (NIST Level 5))
- **Estandar:** FIPS 205 (SLH-DSA)
- **RFC:** RFC 9881 (X.509), RFC 9882 (CMS)
- **Hash:** SHA-3-256
- **Firmado:** Mon Feb 23 2026 21:07:58 GMT+0000 (Coordinated Universal Time)
- **Valido hasta:** Tue Feb 11 2076 21:07:58 GMT+0000 (Coordinated Universal Time)

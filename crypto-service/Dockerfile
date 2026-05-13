# ============================================================
# Stage 1: Build OpenSSL 3.5 with native ML-DSA/SLH-DSA/ML-KEM
# ============================================================
FROM python:3.11-slim AS openssl-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential wget ca-certificates perl && \
    rm -rf /var/lib/apt/lists/*

ARG OPENSSL_VERSION=3.6.1
RUN wget -q https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz && \
    tar xzf openssl-${OPENSSL_VERSION}.tar.gz && \
    cd openssl-${OPENSSL_VERSION} && \
    ./Configure --prefix=/opt/openssl --openssldir=/opt/openssl/ssl shared && \
    make -j$(nproc) && \
    make install_sw install_ssldirs && \
    cd / && rm -rf openssl-${OPENSSL_VERSION}*

# ============================================================
# Stage 2: Final image with liboqs + OpenSSL 3.5
# ============================================================
FROM python:3.11-slim

# Copy OpenSSL 3.5 binaries
COPY --from=openssl-builder /opt/openssl /opt/openssl
ENV PATH="/opt/openssl/bin:${PATH}"

# Install system dependencies for liboqs
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libssl-dev \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

# Build and install liboqs from source
RUN git clone --depth 1 --branch main https://github.com/open-quantum-safe/liboqs.git /tmp/liboqs && \
    cd /tmp/liboqs && \
    mkdir build && cd build && \
    cmake -GNinja -DCMAKE_INSTALL_PREFIX=/usr/local -DBUILD_SHARED_LIBS=ON .. && \
    ninja && \
    ninja install && \
    ldconfig && \
    cd / && rm -rf /tmp/liboqs

# Environment variables
ENV LD_LIBRARY_PATH=/opt/openssl/lib64:/opt/openssl/lib:/usr/local/lib:$LD_LIBRARY_PATH
ENV OQS_SKIP_INSTALL=1

# Verify OpenSSL 3.5 ML-DSA support
RUN /opt/openssl/bin/openssl version && \
    /opt/openssl/bin/openssl genpkey -algorithm mldsa44 -out /tmp/test.key 2>/dev/null && \
    rm -f /tmp/test.key && \
    echo "OpenSSL 3.5 ML-DSA support verified"

# Set working directory
WORKDIR /app

# Create PKI directory for CA certificates
RUN mkdir -p /app/pki

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Fix: Copy liboqs.so to oqs Python package directory
RUN ldconfig && \
    find / -name "liboqs*" -not -path "*/tmp/*" 2>/dev/null | head -20 && \
    LIBOQS_SO=$(find /usr/local -name "liboqs.so*" -type f 2>/dev/null | head -1 || true) && \
    if [ -n "$LIBOQS_SO" ]; then \
      LIBOQS_DIR=$(dirname "$LIBOQS_SO") && \
      echo "Found liboqs at: $LIBOQS_DIR" && \
      cp $LIBOQS_DIR/liboqs.so* /usr/local/lib/python3.11/site-packages/oqs/ ; \
    else \
      echo "liboqs.so not found as shared lib, checking static..." && \
      find /usr/local -name "liboqs*" 2>/dev/null ; \
    fi && \
    ldconfig && \
    python3 -c "import oqs; print('liboqs loaded:', oqs.get_enabled_sig_mechanisms()[:3])"

# Copy application code
COPY . .

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:8001/health')" || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]

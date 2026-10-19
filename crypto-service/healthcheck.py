import os, ssl, sys, urllib.request

scheme = "https" if os.environ.get("TLS_ENABLED") == "true" else "http"
context = ssl._create_unverified_context() if scheme == "https" else None
try:
    urllib.request.urlopen(f"{scheme}://127.0.0.1:8001/health", timeout=5, context=context)
except Exception:
    sys.exit(1)

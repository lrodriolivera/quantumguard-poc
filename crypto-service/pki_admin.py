"""
PKI administration CLI (run inside the crypto-service container).

  python pki_admin.py status   show which CAs exist
  python pki_admin.py init     create missing root / issuing CAs / TSA (one-off ceremony)
  python pki_admin.py crl      regenerate every CRL now

Requires PKI_KEY_PASSPHRASE. Back up the PKI volume and the passphrase,
separately and offline, right after `init`.
"""

import json
import sys

import ca


def main(argv: list) -> int:
    command = argv[1] if len(argv) > 1 else "status"
    if command == "status":
        print(json.dumps(ca.hierarchy_status(), indent=2))
        return 0
    if command == "init":
        print(json.dumps(ca.ensure_hierarchy(allow_create=True), indent=2))
        return 0
    if command == "crl":
        ca.refresh_crls(force=True)
        print("CRLs regenerated")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))

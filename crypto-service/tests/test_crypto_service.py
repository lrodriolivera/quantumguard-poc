"""
Unit tests for QuantumGuard Crypto Service
Tests post-quantum digital signatures with ML-DSA (Dilithium)
"""

import sys
import os
import time
import base64
import hashlib
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Set LD_LIBRARY_PATH for liboqs
os.environ['LD_LIBRARY_PATH'] = '/usr/local/lib:' + os.environ.get('LD_LIBRARY_PATH', '')

import oqs
from main import QuantumCryptoService

# Colors for terminal output
GREEN = '\033[92m'
RED = '\033[91m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def print_test(name, passed, details=""):
    """Print test result"""
    status = f"{GREEN}✓ PASSED{RESET}" if passed else f"{RED}✗ FAILED{RESET}"
    print(f"  {status} - {name}")
    if details:
        print(f"    {details}")

def print_section(title):
    """Print section header"""
    print(f"\n{BLUE}{'='*60}{RESET}")
    print(f"{BLUE}{title}{RESET}")
    print(f"{BLUE}{'='*60}{RESET}\n")

def test_keypair_generation():
    """Test 1: Keypair generation for different algorithms"""
    print_section("TEST 1: Keypair Generation")

    service = QuantumCryptoService()
    algorithms = ['Dilithium2', 'Dilithium3', 'Dilithium5', 'ML-DSA-44']

    all_passed = True
    for alg in algorithms:
        try:
            result = service.generate_keypair(alg)
            passed = (
                result.public_key is not None and
                result.algorithm == alg and
                result.quantum_safe == True and
                result.key_size > 0
            )
            print_test(f"Generate keypair with {alg}", passed,
                      f"Key size: {result.key_size} bytes")
            all_passed = all_passed and passed
        except Exception as e:
            print_test(f"Generate keypair with {alg}", False, f"Error: {str(e)}")
            all_passed = False

    return all_passed

def test_document_signing():
    """Test 2: Sign a document"""
    print_section("TEST 2: Document Signing")

    service = QuantumCryptoService()
    document = b"Test document for quantum-safe signatures"

    try:
        result = service.sign_document(document, 'Dilithium2')
        passed = (
            result.signature_id is not None and
            result.document_hash is not None and
            result.signature is not None and
            result.public_key is not None and
            result.quantum_safe == True and
            result.signature_size > 0
        )
        print_test("Sign document with Dilithium2", passed,
                  f"Signature size: {result.signature_size} bytes")
        return passed, result
    except Exception as e:
        print_test("Sign document with Dilithium2", False, f"Error: {str(e)}")
        return False, None

def test_valid_signature_verification():
    """Test 3: Verify a valid signature"""
    print_section("TEST 3: Valid Signature Verification")

    service = QuantumCryptoService()
    document = b"Test document for verification"

    try:
        # Sign document
        sign_result = service.sign_document(document, 'Dilithium2')

        # Verify signature
        verify_result = service.verify_signature(
            document,
            sign_result.signature,
            sign_result.public_key,
            'Dilithium2'
        )

        passed = verify_result.valid == True
        print_test("Verify valid signature", passed,
                  f"Verification: {verify_result.valid}")
        return passed
    except Exception as e:
        print_test("Verify valid signature", False, f"Error: {str(e)}")
        return False

def test_invalid_signature_verification():
    """Test 4: Verify an invalid signature"""
    print_section("TEST 4: Invalid Signature Verification")

    service = QuantumCryptoService()
    document = b"Original document"
    tampered_document = b"Tampered document"

    try:
        # Sign original document
        sign_result = service.sign_document(document, 'Dilithium2')

        # Try to verify with tampered document
        verify_result = service.verify_signature(
            tampered_document,
            sign_result.signature,
            sign_result.public_key,
            'Dilithium2'
        )

        passed = verify_result.valid == False
        print_test("Detect tampered document", passed,
                  f"Correctly rejected: {not verify_result.valid}")

        # Test with wrong signature
        fake_signature = base64.b64encode(b"fake_signature" * 200).decode()
        verify_result2 = service.verify_signature(
            document,
            fake_signature,
            sign_result.public_key,
            'Dilithium2'
        )

        passed2 = verify_result2.valid == False
        print_test("Detect fake signature", passed2,
                  f"Correctly rejected: {not verify_result2.valid}")

        return passed and passed2
    except Exception as e:
        print_test("Invalid signature verification", False, f"Error: {str(e)}")
        return False

def test_large_documents():
    """Test 5: Handle large documents"""
    print_section("TEST 5: Large Document Handling")

    service = QuantumCryptoService()

    sizes = [
        (1024, "1 KB"),
        (1024 * 100, "100 KB"),
        (1024 * 1024, "1 MB"),
        (1024 * 1024 * 5, "5 MB")
    ]

    all_passed = True
    for size, label in sizes:
        try:
            document = b"x" * size
            start = time.time()
            result = service.sign_document(document, 'Dilithium2')
            elapsed = time.time() - start

            passed = result.signature is not None and elapsed < 5.0
            print_test(f"Sign {label} document", passed,
                      f"Time: {elapsed:.3f}s, Size: {result.signature_size} bytes")
            all_passed = all_passed and passed
        except Exception as e:
            print_test(f"Sign {label} document", False, f"Error: {str(e)}")
            all_passed = False

    return all_passed

def benchmark_keypair_generation():
    """Benchmark: Keypair generation performance"""
    print_section("BENCHMARK 1: Keypair Generation Performance")

    service = QuantumCryptoService()
    algorithms = ['Dilithium2', 'Dilithium3', 'Dilithium5']
    iterations = 10

    for alg in algorithms:
        times = []
        for _ in range(iterations):
            start = time.time()
            service.generate_keypair(alg)
            times.append(time.time() - start)

        avg_time = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)

        print(f"  {alg}:")
        print(f"    Average: {avg_time*1000:.2f} ms")
        print(f"    Min: {min_time*1000:.2f} ms")
        print(f"    Max: {max_time*1000:.2f} ms")
        print(f"    Throughput: {1/avg_time:.2f} keypairs/sec")

def benchmark_signing():
    """Benchmark: Document signing performance"""
    print_section("BENCHMARK 2: Document Signing Performance")

    service = QuantumCryptoService()
    document = b"Test document for benchmarking" * 100  # ~3KB
    iterations = 10

    times = []
    for _ in range(iterations):
        start = time.time()
        service.sign_document(document, 'Dilithium2')
        times.append(time.time() - start)

    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)

    print(f"  Document size: {len(document)} bytes")
    print(f"  Average: {avg_time*1000:.2f} ms")
    print(f"  Min: {min_time*1000:.2f} ms")
    print(f"  Max: {max_time*1000:.2f} ms")
    print(f"  Throughput: {1/avg_time:.2f} signatures/sec")
    print(f"  {GREEN}✓{RESET} Requirement: < 5 seconds {GREEN}PASSED{RESET}" if avg_time < 5 else f"  {RED}✗{RESET} Requirement: < 5 seconds {RED}FAILED{RESET}")

def benchmark_verification():
    """Benchmark: Signature verification performance"""
    print_section("BENCHMARK 3: Signature Verification Performance")

    service = QuantumCryptoService()
    document = b"Test document for benchmarking" * 100

    # Pre-sign document
    sign_result = service.sign_document(document, 'Dilithium2')

    iterations = 10
    times = []
    for _ in range(iterations):
        start = time.time()
        service.verify_signature(
            document,
            sign_result.signature,
            sign_result.public_key,
            'Dilithium2'
        )
        times.append(time.time() - start)

    avg_time = sum(times) / len(times)
    min_time = min(times)
    max_time = max(times)

    print(f"  Average: {avg_time*1000:.2f} ms")
    print(f"  Min: {min_time*1000:.2f} ms")
    print(f"  Max: {max_time*1000:.2f} ms")
    print(f"  Throughput: {1/avg_time:.2f} verifications/sec")
    print(f"  {GREEN}✓{RESET} Requirement: < 1 second {GREEN}PASSED{RESET}" if avg_time < 1 else f"  {RED}✗{RESET} Requirement: < 1 second {RED}FAILED{RESET}")

def run_all_tests():
    """Run all tests and benchmarks"""
    print(f"\n{YELLOW}{'='*60}{RESET}")
    print(f"{YELLOW}QUANTUMGUARD CRYPTO SERVICE - TEST SUITE{RESET}")
    print(f"{YELLOW}ML-DSA (Dilithium) Post-Quantum Signatures{RESET}")
    print(f"{YELLOW}{'='*60}{RESET}\n")

    results = []

    # Unit Tests
    results.append(("Keypair Generation", test_keypair_generation()))
    results.append(("Document Signing", test_document_signing()[0]))
    results.append(("Valid Signature Verification", test_valid_signature_verification()))
    results.append(("Invalid Signature Verification", test_invalid_signature_verification()))
    results.append(("Large Document Handling", test_large_documents()))

    # Benchmarks
    benchmark_keypair_generation()
    benchmark_signing()
    benchmark_verification()

    # Summary
    print_section("TEST SUMMARY")
    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = f"{GREEN}✓ PASSED{RESET}" if result else f"{RED}✗ FAILED{RESET}"
        print(f"  {status} - {name}")

    print(f"\n{BLUE}Total: {passed}/{total} tests passed{RESET}")

    if passed == total:
        print(f"{GREEN}{'='*60}{RESET}")
        print(f"{GREEN}ALL TESTS PASSED! ✓{RESET}")
        print(f"{GREEN}{'='*60}{RESET}\n")
        return 0
    else:
        print(f"{RED}{'='*60}{RESET}")
        print(f"{RED}SOME TESTS FAILED{RESET}")
        print(f"{RED}{'='*60}{RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(run_all_tests())

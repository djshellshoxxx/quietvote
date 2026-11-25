"""qv_verifier -- independent second verifier for QuietVote (skeleton).

STATUS: skeleton, unaudited, NOT for real elections.

Written in Python (stdlib only) from the QuietVote specifications (docs/16-crypto-protocol.md,
docs/34-test-vectors-conformance.md), RFC 8032 (Ed25519), RFC 9496 (ristretto255), RFC 8785
(JCS), RFC 9162 (Merkle tree hash), RFC 5869 (HKDF) and FIPS 197 / SP 800-38D (AES-GCM).
It deliberately does not import, call or translate the TypeScript reference implementation.

None of the arithmetic here is constant-time. It is a *verifier* for public data; the few
operations that touch secrets (ed25519.sign, ballot.encrypt) exist only to reproduce
known-answer test vectors that publish their test secrets.
"""

__version__ = "0.1.0"
IMPL_NAME = "py-qv-verify"

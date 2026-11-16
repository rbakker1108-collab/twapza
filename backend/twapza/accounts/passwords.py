"""Password hashing with scrypt (standard library, no extra dependency)."""

import base64
import hashlib
import hmac
import secrets

N, R, P = 2**14, 8, 1  # ~16 MB of memory per hash
MIN_LENGTH = 8
MAX_LENGTH = 128  # hashing very long inputs is a cheap way to slow the server down


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=32)
    return f"scrypt${N}${R}${P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str | None) -> bool:
    """True if ``password`` matches. With no stored hash, still does the work (same timing)."""
    try:
        _, n, r, p, salt, digest = (stored or "").split("$")
        n, r, p = int(n), int(r), int(p)
        salt_b, digest_b = base64.b64decode(salt), base64.b64decode(digest)
    except ValueError:
        hashlib.scrypt(password.encode(), salt=b"0" * 16, n=N, r=R, p=P, dklen=32)
        return False
    actual = hashlib.scrypt(password.encode(), salt=salt_b, n=n, r=r, p=p, dklen=len(digest_b))
    return hmac.compare_digest(actual, digest_b)


def password_problem(password: str) -> str | None:
    """A message explaining why the password can't be used, or None if it's fine."""
    if len(password) < MIN_LENGTH:
        return f"Use at least {MIN_LENGTH} characters for your password."
    if len(password) > MAX_LENGTH:
        return f"Use at most {MAX_LENGTH} characters for your password."
    return None


def new_token() -> tuple[str, str]:
    """A random token for a cookie or link, and the hash to store."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

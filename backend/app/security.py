import hashlib
import hmac
import base64
import json
import os
import time
import re

from app.config import settings


PASSWORD_POLICY = {
    "min_length": 10,
    "max_length": 128,
    "require_uppercase": True,
    "require_lowercase": True,
    "require_digit": True,
    "require_special": True,
}


def password_policy_errors(password: str, *, username: str = "", full_name: str = "") -> list[str]:
    """Return user-facing policy violations without ever logging the password."""

    value = str(password or "")
    errors: list[str] = []
    if len(value) < PASSWORD_POLICY["min_length"]:
        errors.append(f"Có ít nhất {PASSWORD_POLICY['min_length']} ký tự")
    if len(value) > PASSWORD_POLICY["max_length"]:
        errors.append(f"Không vượt quá {PASSWORD_POLICY['max_length']} ký tự")
    if not re.search(r"[A-Z]", value):
        errors.append("Có ít nhất một chữ hoa")
    if not re.search(r"[a-z]", value):
        errors.append("Có ít nhất một chữ thường")
    if not re.search(r"\d", value):
        errors.append("Có ít nhất một chữ số")
    if not re.search(r"[^A-Za-z0-9\s]", value):
        errors.append("Có ít nhất một ký tự đặc biệt")
    if any(char.isspace() for char in value):
        errors.append("Không chứa khoảng trắng")

    lowered = value.casefold()
    compact_name = re.sub(r"\s+", "", str(full_name or "").casefold())
    normalized_username = str(username or "").strip().casefold()
    if normalized_username and len(normalized_username) >= 4 and normalized_username in lowered:
        errors.append("Không chứa tên đăng nhập")
    if compact_name and len(compact_name) >= 5 and compact_name in re.sub(r"\s+", "", lowered):
        errors.append("Không chứa nguyên họ tên")
    if lowered in {"1", "123456", "12345678", "123456789", "password", "admin123", "agribank"}:
        errors.append("Không dùng mật khẩu mặc định hoặc quá phổ biến")
    return errors


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, salt_hex, digest_hex = password_hash.split("$", 2)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def create_access_token(user_id: int | str, auth_version: int = 1, session_id: str | None = None) -> str:
    payload = {
        "sub": str(user_id),
        "ver": int(auth_version),
        "exp": int(time.time()) + max(int(settings.ACCESS_TOKEN_EXPIRE_MINUTES), 1) * 60,
    }
    if session_id:
        payload["sid"] = str(session_id)
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).rstrip(b"=")
    signature = hmac.new(settings.AUTH_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
    return f"{encoded.decode('ascii')}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def decode_access_token(token: str) -> dict:
    try:
        encoded_text, signature_text = token.split(".", 1)
        encoded = encoded_text.encode("ascii")
        expected = hmac.new(settings.AUTH_SECRET.encode("utf-8"), encoded, hashlib.sha256).digest()
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        raw = base64.urlsafe_b64decode(encoded_text + "=" * (-len(encoded_text) % 4))
        payload = json.loads(raw.decode("utf-8"))
        if int(payload.get("exp") or 0) <= int(time.time()) or not payload.get("sub"):
            raise ValueError("expired token")
        return payload
    except Exception as exc:
        raise ValueError("invalid access token") from exc

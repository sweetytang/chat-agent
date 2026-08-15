"""Application-layer encryption for MCP static credentials."""

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class CredentialCrypto:
    def __init__(self, key: bytes) -> None:
        if len(key) not in {16, 24, 32}:
            raise ValueError("MCP credential key must be 128, 192 or 256 bits")
        self._key = key

    def encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(12)
        ciphertext = AESGCM(self._key).encrypt(nonce, plaintext.encode(), None)
        return "v1:" + base64.urlsafe_b64encode(nonce + ciphertext).decode()

    def decrypt(self, value: str) -> str:
        if not value.startswith("v1:"):
            raise ValueError("不支持的 MCP 凭据密文版本")
        payload = base64.urlsafe_b64decode(value[3:].encode())
        if len(payload) <= 12:
            raise ValueError("MCP 凭据密文无效")
        decrypted: bytes = AESGCM(self._key).decrypt(payload[:12], payload[12:], None)
        return decrypted.decode()

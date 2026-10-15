"""One-off: generate a VAPID key pair for Web Push (M10-05).

Run once per environment (dev/prod each need their own pair):
    cd backend && uv run python scripts/generate_vapid_keys.py

Paste the output into VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env.dev / .env.prod (never commit
the private key). The public key is not a secret — the frontend reads it from `GET /api/v1/me`.
"""

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid01
from py_vapid.utils import b64urlencode


def main() -> None:
    vapid = Vapid01()
    vapid.generate_keys()
    private_value = vapid.private_key.private_numbers().private_value
    private_key = b64urlencode(private_value.to_bytes(32, "big"))
    public_key = b64urlencode(vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")


if __name__ == "__main__":
    main()

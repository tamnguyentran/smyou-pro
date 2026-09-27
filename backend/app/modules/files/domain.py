"""Pure file-validation rules (DOMAIN_MODEL §11). No framework imports."""

ALLOWED_IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic")

# ISO-BMFF major/compatible brands used by HEIC/HEIF; other ftyp boxes (MP4, MOV, AVIF, ...) must not match.
HEIC_BRANDS = (b"heic", b"heix", b"heim", b"heis", b"hevc", b"hevx", b"mif1", b"msf1")


class ImageError(Exception):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail


def sniff_image_mime(data: bytes) -> str | None:
    """Best-effort magic-byte detection; None when unrecognized."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in HEIC_BRANDS:
        return "image/heic"
    return None


def validate_image(data: bytes, declared_mime: str, *, max_bytes: int) -> str:
    """Returns the confirmed mime type, or raises ImageError."""
    if len(data) > max_bytes:
        raise ImageError("FILE_TOO_LARGE", f"Ảnh vượt quá {max_bytes // (1024 * 1024)}MB.")
    if declared_mime not in ALLOWED_IMAGE_MIME_TYPES:
        raise ImageError("UNSUPPORTED_MEDIA_TYPE", "Loại tệp không được hỗ trợ.")
    if sniff_image_mime(data) != declared_mime:
        raise ImageError("INVALID_FILE_TYPE", "Tệp không phải ảnh hợp lệ.")
    return declared_mime

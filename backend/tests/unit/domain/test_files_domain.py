"""M2-01a pure rules: image magic-byte sniffing and validation (DOMAIN_MODEL §11)."""

import pytest

from app.modules.files.domain import ImageError, sniff_image_mime, validate_image

JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 20
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
WEBP = b"RIFF" + b"\x00" * 4 + b"WEBP" + b"\x00" * 20
HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 20
MP4_NOT_HEIC = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 20  # ISO-BMFF but not a HEIC brand
NOT_AN_IMAGE = b"plain text, not a picture"


@pytest.mark.ac("AC-CAT-009")
@pytest.mark.parametrize(
    ("data", "mime"),
    [
        (JPEG, "image/jpeg"),
        (PNG, "image/png"),
        (WEBP, "image/webp"),
        (HEIC, "image/heic"),
        (MP4_NOT_HEIC, None),
        (NOT_AN_IMAGE, None),
    ],
)
def test_sniff_image_mime(data: bytes, mime: str | None) -> None:
    assert sniff_image_mime(data) == mime


@pytest.mark.ac("AC-CAT-008")
def test_validate_image_accepts_matching_jpeg() -> None:
    assert validate_image(JPEG, "image/jpeg", max_bytes=1024) == "image/jpeg"


@pytest.mark.ac("AC-CAT-009")
def test_validate_image_rejects_too_large() -> None:
    with pytest.raises(ImageError) as exc:
        validate_image(JPEG, "image/jpeg", max_bytes=1)
    assert exc.value.code == "FILE_TOO_LARGE"


@pytest.mark.ac("AC-CAT-009")
def test_validate_image_rejects_unsupported_declared_mime() -> None:
    with pytest.raises(ImageError) as exc:
        validate_image(JPEG, "image/gif", max_bytes=1024)
    assert exc.value.code == "UNSUPPORTED_MEDIA_TYPE"


@pytest.mark.ac("AC-CAT-009")
def test_validate_image_rejects_magic_byte_mismatch() -> None:
    with pytest.raises(ImageError) as exc:
        validate_image(NOT_AN_IMAGE, "image/jpeg", max_bytes=1024)
    assert exc.value.code == "INVALID_FILE_TYPE"

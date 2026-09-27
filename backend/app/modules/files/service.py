"""Attachment storage use cases (M2-01a). Callers own the transaction; this never commits.

Only `owner_type="PRODUCT", kind="PRODUCT_IMAGE"` is exercised today; M6-01 adds the rest on this table.
"""

import hashlib
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import AppError
from app.modules.files.domain import ImageError, validate_image
from app.modules.files.models import Attachment


def _storage_path(settings: Settings, storage_key: str) -> Path:
    return settings.upload_dir / storage_key


def store_image(
    session: Session,
    *,
    owner_type: str,
    owner_id: uuid.UUID,
    kind: str,
    file_bytes: bytes,
    filename: str,
    declared_mime: str,
    uploaded_by: uuid.UUID,
    settings: Settings,
    now: datetime,
) -> Attachment:
    try:
        mime = validate_image(file_bytes, declared_mime, max_bytes=settings.upload_max_mb * 1024 * 1024)
    except ImageError as exc:
        raise AppError(422, exc.code, exc.detail) from exc
    storage_key = f"{now:%Y}/{now:%m}/{uuid.uuid4()}"
    path = _storage_path(settings, storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(file_bytes)
    attachment = Attachment(
        owner_type=owner_type,
        owner_id=owner_id,
        kind=kind,
        storage_key=storage_key,
        original_filename=filename,
        mime_type=mime,
        size_bytes=len(file_bytes),
        sha256=hashlib.sha256(file_bytes).hexdigest(),
        uploaded_by=uploaded_by,
    )
    session.add(attachment)
    session.flush()
    return attachment


def get_or_404(session: Session, attachment_id: uuid.UUID) -> Attachment:
    attachment = session.scalar(select(Attachment).where(Attachment.id == attachment_id))
    if attachment is None:
        raise AppError(404, "NOT_FOUND", "Không tìm thấy tệp.")
    return attachment


def read_bytes(attachment: Attachment, settings: Settings) -> bytes:
    return _storage_path(settings, attachment.storage_key).read_bytes()

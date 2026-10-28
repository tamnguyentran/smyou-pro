"""Company profile use cases (M17-01). Callers own the transaction; this never commits."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.authz import Actor
from app.core.config import Settings
from app.core.errors import AppError
from app.modules.audit import service as audit
from app.modules.company.domain import COMPANY_PROFILE_ID
from app.modules.company.models import CompanyProfile
from app.modules.company.schemas import CompanyProfileOut, CompanyProfileUpdate
from app.modules.files import service as files


def _locked(session: Session, version: int) -> CompanyProfile:
    profile = session.scalars(select(CompanyProfile).with_for_update()).one()
    if profile.version != version:
        raise AppError(409, "STALE_VERSION", "Thông tin đã bị người khác thay đổi. Vui lòng tải lại.")
    return profile


def _record(
    session: Session, actor: Actor, action: str, data: dict[str, object], request_id: str | None
) -> None:
    audit.record(
        session,
        actor_id=actor.id,
        entity_type="COMPANY_PROFILE",
        entity_id=COMPANY_PROFILE_ID,
        action=action,
        data=data,
        request_id=request_id,
    )


def get_profile(session: Session) -> CompanyProfileOut:
    return CompanyProfileOut.model_validate(session.scalars(select(CompanyProfile)).one())


def update_profile(
    session: Session, actor: Actor, body: CompanyProfileUpdate, *, request_id: str | None = None
) -> CompanyProfileOut:
    profile = _locked(session, body.version)
    changes: dict[str, object] = {}
    for field, new_value in body.model_dump(exclude_unset=True, exclude={"version"}).items():
        old_value = getattr(profile, field)
        if old_value != new_value:
            changes[field] = {"from": old_value, "to": new_value}
            setattr(profile, field, new_value)
    if not changes:
        # No-op edit: keep the version so other open forms don't get a spurious STALE_VERSION.
        return CompanyProfileOut.model_validate(profile)
    profile.version += 1
    session.flush()
    _record(session, actor, "company_profile.update", changes, request_id)
    session.refresh(profile)
    return CompanyProfileOut.model_validate(profile)


def upload_logo(
    session: Session,
    actor: Actor,
    *,
    version: int,
    file_bytes: bytes,
    filename: str,
    declared_mime: str,
    settings: Settings,
    now: datetime,
    request_id: str | None = None,
) -> CompanyProfileOut:
    profile = _locked(session, version)
    attachment = files.store_image(
        session,
        owner_type="COMPANY",
        owner_id=COMPANY_PROFILE_ID,
        kind="COMPANY_LOGO",
        file_bytes=file_bytes,
        filename=filename,
        declared_mime=declared_mime,
        uploaded_by=actor.id,
        settings=settings,
        now=now,
    )
    # The previous logo's attachment row stays (attachments are never deleted); only the pointer moves.
    previous = profile.logo_attachment_id
    profile.logo_attachment_id = attachment.id
    profile.version += 1
    session.flush()
    _record(
        session,
        actor,
        "company_profile.logo_update",
        {"logo_attachment_id": {"from": str(previous) if previous else None, "to": str(attachment.id)}},
        request_id,
    )
    session.refresh(profile)
    return CompanyProfileOut.model_validate(profile)

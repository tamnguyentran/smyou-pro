"""M1-05: audit.service.record — the shared write path other modules will call for the `audit`
effect (spec/state_machines.yaml). No DB: a fake session captures what would be inserted.
"""

import uuid
from dataclasses import dataclass, field
from typing import cast

import pytest
from sqlalchemy.orm import Session

from app.modules.audit import service
from app.modules.audit.models import AuditEvent


@dataclass
class _FakeSession:
    added: list[object] = field(default_factory=list)

    def add(self, obj: object) -> None:
        self.added.append(obj)


@pytest.mark.ac("AC-SYS-052")
def test_record_builds_the_row_with_the_given_fields() -> None:
    session = _FakeSession()
    entity_id = uuid.uuid4()
    actor_id = uuid.uuid4()

    service.record(
        cast(Session, session),
        actor_id=actor_id,
        entity_type="EMPLOYEE",
        entity_id=entity_id,
        action="update",
        data={"changed_fields": ["phone"]},
        request_id="test-req-1",
    )

    assert len(session.added) == 1
    event = session.added[0]
    assert isinstance(event, AuditEvent)
    assert event.actor_id == actor_id
    assert event.entity_type == "EMPLOYEE"
    assert event.entity_id == entity_id
    assert event.action == "update"
    assert event.from_status is None
    assert event.to_status is None
    assert event.data == {"changed_fields": ["phone"]}
    assert event.request_id == "test-req-1"


@pytest.mark.ac("AC-SYS-052")
def test_record_accepts_a_null_actor_and_status_transition() -> None:
    session = _FakeSession()
    entity_id = uuid.uuid4()

    service.record(
        cast(Session, session),
        actor_id=None,
        entity_type="EMPLOYEE",
        entity_id=entity_id,
        action="deactivate",
        from_status="ACTIVE",
        to_status="INACTIVE",
    )

    [event] = cast(list[AuditEvent], session.added)
    assert event.actor_id is None
    assert event.from_status == "ACTIVE"
    assert event.to_status == "INACTIVE"


@pytest.mark.ac("AC-SYS-054")
def test_unknown_entity_type_raises_before_touching_the_session() -> None:
    session = _FakeSession()

    with pytest.raises(ValueError, match="FOO"):
        service.record(
            cast(Session, session), actor_id=None, entity_type="FOO", entity_id=uuid.uuid4(), action="x"
        )

    assert session.added == []

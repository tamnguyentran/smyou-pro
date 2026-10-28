"""M16-01a: customer gift tracking API (AC-GFT-001…015)."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, event, text

from tests.integration.conftest import AN, KHOA, Person, login, seed

HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
LAN = Person("lan.vo@smyou.vn", "Lan@SmYou26", ("CUSTOMER_CARE",), "NV015", "Võ Thị Lan", "SALES")

JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200 + b"\xff\xd9"


def insert_customer(db: Connection, *, created_by: uuid.UUID, code: str = "KH00001") -> uuid.UUID:
    customer_id = uuid.uuid4()
    db.execute(
        text(
            "INSERT INTO customers (id, code, type, name, phone, created_by, version)"
            " VALUES (:id, :code, 'COMPANY', 'Cty Sáng Tạo Mới', '0909123456', :created_by, 1)"
        ),
        {"id": customer_id, "code": code, "created_by": created_by},
    )
    return customer_id


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.email, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, HOA, LAN, KHOA)}


@pytest.fixture
def customer_id(db: Connection, people: dict[str, uuid.UUID]) -> uuid.UUID:
    return insert_customer(db, created_by=people["NV005"])


def gift_body(people: dict[str, uuid.UUID], customer: uuid.UUID, **overrides: object) -> dict[str, object]:
    base = {
        "customer_id": str(customer),
        "occasion_name": "Tết 2027",
        "performed_date": "2027-01-20",
        "gift_name": "Giỏ quà Tết",
        "quantity": 2,
        "unit_price": 500000,
        "other_cost": 50000,
        "performed_by": str(people["NV005"]),
        "requested_by": str(people["NV001"]),
    }
    base.update(overrides)
    return base


@pytest.mark.ac("AC-GFT-001")
def test_create_happy_path(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id))

    assert res.status_code == 201, res.text
    body = res.json()
    assert body["total_amount"] == 1050000
    assert body["version"] == 1
    assert body["performed_by"]["code"] == "NV005"
    assert body["requested_by"]["code"] == "NV001"


@pytest.mark.ac("AC-GFT-002")
def test_create_rejects_client_sent_total_amount(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)

    res = hoa.post("/api/v1/customer-gifts", json={**gift_body(people, customer_id), "total_amount": 999})

    body = problem(res, 422, "VALIDATION_ERROR")
    assert "total_amount" in [e["field"] for e in body["errors"]]


@pytest.mark.ac("AC-GFT-003")
@pytest.mark.parametrize(
    ("change", "field"),
    [({"quantity": 0}, "quantity"), ({"unit_price": -1000}, "unit_price")],
)
def test_create_validation_errors(
    app: FastAPI,
    db: Connection,
    people: dict[str, uuid.UUID],
    customer_id: uuid.UUID,
    change: dict[str, object],
    field: str,
) -> None:
    hoa = client_as(app, HOA)
    res = hoa.post("/api/v1/customer-gifts", json={**gift_body(people, customer_id), **change})
    body = problem(res, 422, "VALIDATION_ERROR")
    assert field in [e["field"] for e in body["errors"]]


@pytest.mark.ac("AC-GFT-004")
def test_customer_care_can_create(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    lan = client_as(app, LAN)
    res = lan.post("/api/v1/customer-gifts", json=gift_body(people, customer_id))
    assert res.status_code == 201, res.text


@pytest.mark.ac("AC-GFT-005")
def test_technician_forbidden(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    khoa = client_as(app, KHOA)
    res = khoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id))
    problem(res, 403, "FORBIDDEN")


@pytest.mark.ac("AC-GFT-006")
def test_list_scoped_to_customer_all_creators(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    other_customer = insert_customer(db, created_by=people["NV005"], code="KH00002")
    hoa = client_as(app, HOA)
    lan = client_as(app, LAN)
    hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id, occasion_name="Tết"))
    lan.post("/api/v1/customer-gifts", json=gift_body(people, customer_id, occasion_name="8/3"))
    hoa.post("/api/v1/customer-gifts", json=gift_body(people, other_customer))

    res = hoa.get("/api/v1/customer-gifts", params={"customer_id": str(customer_id)})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 2
    assert {item["occasion_name"] for item in body["items"]} == {"Tết", "8/3"}


@pytest.mark.ac("AC-GFT-007")
def test_anyone_can_edit_anyones_record(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    lan = client_as(app, LAN)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()

    res = lan.patch(
        f"/api/v1/customer-gifts/{created['id']}",
        json={"version": 1, "gift_name": "Giỏ quà Tết cao cấp"},
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["gift_name"] == "Giỏ quà Tết cao cấp"
    assert body["version"] == 2


@pytest.mark.ac("AC-GFT-008")
def test_update_writes_audit_history_with_before_after(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    lan = client_as(app, LAN)
    an = client_as(app, AN)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()
    lan.patch(
        f"/api/v1/customer-gifts/{created['id']}",
        json={"version": 1, "gift_name": "Giỏ quà Tết cao cấp"},
    )

    history = an.get(
        "/api/v1/audit-events", params={"entity_type": "CUSTOMER_GIFT", "entity_id": created["id"]}
    )

    assert history.status_code == 200, history.text
    events = history.json()["items"]
    update_event = next(e for e in events if e["action"] == "update")
    assert update_event["actor"]["code"] == "NV015"
    assert update_event["data"]["changed_fields"]["gift_name"] == {
        "from": "Giỏ quà Tết",
        "to": "Giỏ quà Tết cao cấp",
    }


@pytest.mark.ac("AC-GFT-009")
def test_update_rejects_customer_id(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    other_customer = insert_customer(db, created_by=people["NV005"], code="KH00003")
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()

    res = hoa.patch(
        f"/api/v1/customer-gifts/{created['id']}",
        json={"version": 1, "customer_id": str(other_customer)},
    )

    body = problem(res, 422, "VALIDATION_ERROR")
    assert "customer_id" in [e["field"] for e in body["errors"]]


@pytest.mark.ac("AC-GFT-010")
def test_update_stale_version(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()
    hoa.patch(f"/api/v1/customer-gifts/{created['id']}", json={"version": 1, "quantity": 3})

    stale = hoa.patch(f"/api/v1/customer-gifts/{created['id']}", json={"version": 1, "quantity": 5})

    problem(stale, 409, "STALE_VERSION")


@pytest.mark.ac("AC-GFT-010")
def test_update_locks_the_row_before_the_version_check(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    """Review M16: without FOR UPDATE two concurrent PATCHes with the same version both win."""
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()
    locked: list[str] = []

    def spy(_conn: object, _cursor: object, statement: str, *_args: object) -> None:
        if "FOR UPDATE" in statement and "customer_gifts" in statement:
            locked.append(statement)

    event.listen(db, "before_cursor_execute", spy)
    try:
        res = hoa.patch(f"/api/v1/customer-gifts/{created['id']}", json={"version": 1, "quantity": 3})
    finally:
        event.remove(db, "before_cursor_execute", spy)

    assert res.status_code == 200, res.text
    assert len(locked) == 1


@pytest.mark.ac("AC-GFT-011")
def test_upload_and_list_photo(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()

    res = hoa.post(
        f"/api/v1/customer-gifts/{created['id']}/photos",
        files={"file": ("gift.jpg", JPEG_BYTES, "image/jpeg")},
    )
    assert res.status_code == 201, res.text
    photo_id = res.json()["id"]

    listed = hoa.get(f"/api/v1/customer-gifts/{created['id']}/photos")
    assert listed.status_code == 200, listed.text
    assert [p["id"] for p in listed.json()["items"]] == [photo_id]


@pytest.mark.ac("AC-GFT-012")
def test_upload_rejects_non_image(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()

    res = hoa.post(
        f"/api/v1/customer-gifts/{created['id']}/photos",
        files={"file": ("note.txt", b"hello", "image/jpeg")},
    )

    problem(res, 422, "INVALID_FILE_TYPE")


@pytest.mark.ac("AC-GFT-013")
def test_read_photo_via_attachments_endpoint(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()
    photo_id = hoa.post(
        f"/api/v1/customer-gifts/{created['id']}/photos",
        files={"file": ("gift.jpg", JPEG_BYTES, "image/jpeg")},
    ).json()["id"]

    res = hoa.get(f"/api/v1/attachments/{photo_id}")

    assert res.status_code == 200, res.text
    assert res.content == JPEG_BYTES


@pytest.mark.ac("AC-GFT-014")
def test_read_photo_forbidden_for_technician(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    khoa = client_as(app, KHOA)
    created = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id)).json()
    photo_id = hoa.post(
        f"/api/v1/customer-gifts/{created['id']}/photos",
        files={"file": ("gift.jpg", JPEG_BYTES, "image/jpeg")},
    ).json()["id"]

    res = khoa.get(f"/api/v1/attachments/{photo_id}")

    problem(res, 403, "FORBIDDEN")


@pytest.mark.ac("AC-GFT-015")
def test_list_requires_customer_id(app: FastAPI, db: Connection, people: dict[str, uuid.UUID]) -> None:
    hoa = client_as(app, HOA)
    res = hoa.get("/api/v1/customer-gifts")
    assert res.status_code == 422, res.text


@pytest.mark.ac("AC-GFT-016")
def test_note_create_and_update(
    app: FastAPI, db: Connection, people: dict[str, uuid.UUID], customer_id: uuid.UUID
) -> None:
    hoa = client_as(app, HOA)
    an = client_as(app, AN)
    created = hoa.post(
        "/api/v1/customer-gifts",
        json=gift_body(people, customer_id, note="Khách hẹn giao chiều"),
    ).json()
    assert created["note"] == "Khách hẹn giao chiều"

    updated = hoa.patch(
        f"/api/v1/customer-gifts/{created['id']}",
        json={"version": 1, "note": "Đã giao"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["note"] == "Đã giao"

    history = an.get(
        "/api/v1/audit-events", params={"entity_type": "CUSTOMER_GIFT", "entity_id": created["id"]}
    )
    update_event = next(e for e in history.json()["items"] if e["action"] == "update")
    assert update_event["data"]["changed_fields"]["note"] == {
        "from": "Khách hẹn giao chiều",
        "to": "Đã giao",
    }

    no_note = hoa.post("/api/v1/customer-gifts", json=gift_body(people, customer_id))
    assert no_note.json()["note"] is None

"""M17-01: company profile API (AC-SYS-122…132)."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, text

from tests.integration.conftest import AN, KHOA, Person, login, seed

BINH = Person("binh.le@smyou.vn", "Binh@SmYou26", ("MANAGER",), "NV002", "Lê Văn Bình", "MANAGEMENT")
HOA = Person("hoa.le@smyou.vn", "Hoa@SmYou26", ("SALE",), "NV005", "Lê Thị Hoa", "SALES")
CHI = Person("chi.pham@smyou.vn", "Chi@SmYou26", ("CUSTOMER_CARE",), "NV015", "Phạm Thị Chi", "SALES")
LONG = Person("long.do@smyou.vn", "Long@SmYou26", ("TECH_LEAD",), "NV010", "Đỗ Văn Long", "TECHNICAL")

URL = "/api/v1/company-profile"
LOGO_URL = "/api/v1/company-profile/logo"
PNG_A = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200 + b"A"
PNG_B = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200 + b"B"

SEED = {
    "name": "CÔNG TY TNHH SMYOU",
    "tax_code": "0309390732",
    "address": "8C/A-9C/A Nguyễn Ảnh Thủ, Khu Phố 1, P. Trung Mỹ Tây, TP.HCM",
    "phone": "0932068787",
    "phone_secondary": "02862501997",
    "fax": "02862533978",
    "email": "kimyensmyou@gmail.com",
    "website": "http://smyou.vn",
}


def client_as(app: FastAPI, person: Person) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    res = login(client, person.username, person.password)
    assert res.status_code == 200, res.text
    return client


def problem(res, status: int, code: str) -> dict:
    assert res.status_code == status, res.text
    body = res.json()
    assert body["code"] == code
    return body


def company_audits(db: Connection) -> list[dict]:
    rows = db.execute(
        text(
            "SELECT action, actor_id, data FROM audit_events"
            " WHERE entity_type = 'COMPANY_PROFILE' ORDER BY occurred_at, id"
        )
    )
    return [dict(r._mapping) for r in rows]


@pytest.fixture
def people(db: Connection) -> dict[str, uuid.UUID]:
    return {p.code: seed(db, p) for p in (AN, BINH, HOA, CHI, LONG, KHOA)}


@pytest.fixture
def an(app: FastAPI, people: dict[str, uuid.UUID]) -> TestClient:
    return client_as(app, AN)


def upload(client: TestClient, version: int, data: bytes = PNG_A, name: str = "logo-smyou.png"):
    return client.post(LOGO_URL, params={"version": version}, files={"file": (name, data, "image/png")})


@pytest.mark.ac("AC-SYS-122")
def test_get_returns_seeded_profile(an: TestClient) -> None:
    res = an.get(URL)

    assert res.status_code == 200, res.text
    body = res.json()
    for field, value in SEED.items():
        assert body[field] == value, field
    assert body["logo_attachment_id"] is None
    assert body["version"] == 1
    assert body["updated_at"]


@pytest.mark.ac("AC-SYS-123")
def test_patch_address_changes_only_that_field_and_audits(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    new_address = "8C/A-9C/A Nguyễn Ảnh Thủ, KP1, P. Trung Mỹ Tây, TP.HCM"

    res = an.patch(URL, json={"address": new_address, "version": 1})

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["address"] == new_address
    assert body["version"] == 2
    for field, value in SEED.items():
        if field != "address":
            assert body[field] == value, field
    audits = company_audits(db)
    assert len(audits) == 1
    assert audits[0]["action"] == "company_profile.update"
    assert audits[0]["actor_id"] == people["NV001"]
    assert audits[0]["data"] == {"address": {"from": SEED["address"], "to": new_address}}


@pytest.mark.ac("AC-SYS-123")
@pytest.mark.parametrize("extra", [{}, {"address": SEED["address"]}], ids=["empty", "same-value"])
def test_patch_without_changes_keeps_version_and_writes_no_audit(
    an: TestClient, db: Connection, extra: dict[str, str]
) -> None:
    res = an.patch(URL, json={**extra, "version": 1})

    assert res.status_code == 200, res.text
    assert res.json()["version"] == 1
    assert company_audits(db) == []


@pytest.mark.ac("AC-SYS-124")
def test_patch_normalizes_phone_numbers(an: TestClient) -> None:
    res = an.patch(
        URL,
        json={
            "phone": "0932 06 8787",
            "phone_secondary": "028.6250.1997",
            "fax": "028 6253 3978",
            "version": 1,
        },
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["phone"], body["phone_secondary"], body["fax"]) == (
        "0932068787",
        "02862501997",
        "02862533978",
    )


@pytest.mark.ac("AC-SYS-125")
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", "  "),
        ("tax_code", "03093907"),
        ("email", "kimyen"),
        ("website", "smyou.vn"),
        ("phone", "12345"),
    ],
)
def test_patch_rejects_invalid_values(an: TestClient, db: Connection, field: str, value: str) -> None:
    res = an.patch(URL, json={field: value, "version": 1})

    body = problem(res, 422, "VALIDATION_ERROR")
    errors = {e["field"]: e["message"] for e in body["errors"]}
    assert list(errors) == [field]
    assert errors[field]
    assert errors[field] != "Giá trị không hợp lệ."
    after = an.get(URL).json()
    assert after["version"] == 1
    assert after[field] == SEED[field]
    assert company_audits(db) == []


@pytest.mark.ac("AC-SYS-125")
def test_patch_error_messages_are_vietnamese(an: TestClient) -> None:
    expected = {
        "name": ("  ", "Vui lòng nhập tên Công ty"),
        "tax_code": ("03093907", "Mã số thuế gồm 10 hoặc 13 chữ số"),
        "email": ("kimyen", "Email không hợp lệ"),
        "website": ("smyou.vn", "Website phải bắt đầu bằng http:// hoặc https://"),
        "phone": ("12345", "Số điện thoại không hợp lệ"),
    }
    for field, (value, message) in expected.items():
        body = an.patch(URL, json={field: value, "version": 1}).json()
        assert message in body["errors"][0]["message"], field


@pytest.mark.ac("AC-SYS-126")
def test_patch_clears_optional_fields(an: TestClient) -> None:
    res = an.patch(
        URL, json={"phone_secondary": None, "fax": None, "email": None, "website": None, "version": 1}
    )

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["phone_secondary"], body["fax"], body["email"], body["website"]) == (None, None, None, None)
    assert body["name"] == SEED["name"]


@pytest.mark.ac("AC-SYS-126")
@pytest.mark.parametrize("field", ["name", "tax_code", "address", "phone"])
def test_patch_rejects_null_for_required_fields(an: TestClient, field: str) -> None:
    res = an.patch(URL, json={field: None, "version": 1})

    body = problem(res, 422, "VALIDATION_ERROR")
    assert [e["field"] for e in body["errors"]] == [field]
    assert an.get(URL).json()[field] == SEED[field]


@pytest.mark.ac("AC-SYS-127")
def test_patch_with_stale_version_is_rejected(app: FastAPI, an: TestClient, db: Connection) -> None:
    binh = client_as(app, BINH)
    assert binh.patch(URL, json={"fax": "02862533979", "version": 1}).status_code == 200
    before = an.get(URL).json()

    res = an.patch(URL, json={"address": "Địa chỉ khác", "version": 1})

    problem(res, 409, "STALE_VERSION")
    assert an.get(URL).json() == before
    assert len(company_audits(db)) == 1


@pytest.mark.ac("AC-SYS-128")
@pytest.mark.parametrize("person", [HOA, CHI, LONG, KHOA], ids=lambda p: p.roles[0])
def test_non_managers_are_forbidden(app: FastAPI, people: dict[str, uuid.UUID], person: Person) -> None:
    client = client_as(app, person)

    problem(client.get(URL), 403, "FORBIDDEN")
    problem(client.patch(URL, json={"fax": None, "version": 1}), 403, "FORBIDDEN")
    problem(upload(client, 1), 403, "FORBIDDEN")


@pytest.mark.ac("AC-SYS-129")
def test_upload_logo_sets_attachment_and_audits(
    an: TestClient, db: Connection, people: dict[str, uuid.UUID]
) -> None:
    assert an.patch(URL, json={"fax": "02862533979", "version": 1}).status_code == 200

    res = upload(an, 2)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["version"] == 3
    logo_id = body["logo_attachment_id"]
    assert logo_id is not None
    row = db.execute(text("SELECT owner_type, kind FROM attachments WHERE id = :id"), {"id": logo_id}).one()
    assert (row.owner_type, row.kind) == ("COMPANY", "COMPANY_LOGO")
    audits = company_audits(db)
    assert [a["action"] for a in audits] == ["company_profile.update", "company_profile.logo_update"]
    assert audits[1]["actor_id"] == people["NV001"]
    image = an.get(f"/api/v1/attachments/{logo_id}")
    assert image.status_code == 200, image.text
    assert image.content == PNG_A


@pytest.mark.ac("AC-SYS-130")
def test_replace_logo_and_reject_stale_version(an: TestClient) -> None:
    first = upload(an, 1, PNG_A).json()
    assert first["version"] == 2

    res = upload(an, 2, PNG_B, "logo-b.png")

    assert res.status_code == 200, res.text
    second = res.json()
    assert second["version"] == 3
    assert second["logo_attachment_id"] != first["logo_attachment_id"]
    problem(upload(an, 2, PNG_A), 409, "STALE_VERSION")
    after = an.get(URL).json()
    assert after["logo_attachment_id"] == second["logo_attachment_id"]
    assert after["version"] == 3
    assert an.get(f"/api/v1/attachments/{second['logo_attachment_id']}").content == PNG_B


@pytest.mark.ac("AC-SYS-131")
def test_upload_rejects_non_image(an: TestClient, db: Connection) -> None:
    res = upload(an, 1, b"day la file text", "logo.png")

    problem(res, 422, "INVALID_FILE_TYPE")
    after = an.get(URL).json()
    assert (after["logo_attachment_id"], after["version"]) == (None, 1)
    assert company_audits(db) == []


@pytest.mark.ac("AC-SYS-132")
def test_sale_cannot_read_logo_attachment(app: FastAPI, an: TestClient, people: dict[str, uuid.UUID]) -> None:
    logo_id = upload(an, 1).json()["logo_attachment_id"]
    hoa = client_as(app, HOA)

    problem(hoa.get(f"/api/v1/attachments/{logo_id}"), 403, "FORBIDDEN")

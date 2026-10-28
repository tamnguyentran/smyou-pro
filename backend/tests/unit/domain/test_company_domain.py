"""M17-01 pure rules: company profile phone / tax code / website checks."""

import pytest

from app.modules.company.domain import check_phone, check_tax_code, check_website


@pytest.mark.ac("AC-SYS-124")
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("0932 06 8787", "0932068787"),
        ("028.6250.1997", "02862501997"),
        ("028-6253-3978", "02862533978"),
        ("0932068787", "0932068787"),
    ],
)
def test_phone_is_normalized_and_accepts_mobile_and_landline(raw: str, expected: str) -> None:
    assert check_phone(raw) == expected


@pytest.mark.ac("AC-SYS-125")
@pytest.mark.parametrize("raw", ["12345", "1932068787", "093206878", "093206878712", "   "])
def test_phone_rejects_invalid_numbers(raw: str) -> None:
    with pytest.raises(ValueError, match="Số điện thoại không hợp lệ"):
        check_phone(raw)


@pytest.mark.ac("AC-SYS-125")
def test_tax_code_accepts_10_or_13_digits_only() -> None:
    assert check_tax_code(" 0309390732 ") == "0309390732"
    assert check_tax_code("0309390732-001") == "0309390732-001"
    for raw in ("03093907", "0309390732001", "0309390732-01", "abcdefghij", ""):
        with pytest.raises(ValueError, match="Mã số thuế gồm 10 hoặc 13 chữ số"):
            check_tax_code(raw)


@pytest.mark.ac("AC-SYS-125")
def test_website_requires_http_or_https_scheme() -> None:
    assert check_website("http://smyou.vn") == "http://smyou.vn"
    assert check_website(" https://smyou.vn/gioi-thieu ") == "https://smyou.vn/gioi-thieu"
    for raw in ("smyou.vn", "ftp://smyou.vn", "http://", "https:// smyou.vn"):
        with pytest.raises(ValueError, match="Website phải bắt đầu bằng http:// hoặc https://"):
            check_website(raw)

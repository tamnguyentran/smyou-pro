"""Command line tools: `python -m app.cli create-manager --email … --full-name … --code …`.

Bootstraps the first Manager on a fresh database; later accounts are created in the app (M1-04).
"""

import argparse
import getpass
import re
import sys
from datetime import UTC, datetime

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.db import create_db_engine, create_session_factory
from app.modules.identity.domain import password_problems
from app.modules.identity.schemas import EMAIL_PATTERN
from app.modules.identity.service import Failure, create_manager

_DUPLICATES = {
    Failure.DUPLICATE_EMAIL: "Email đã tồn tại.",
    Failure.DUPLICATE_CODE: "Mã nhân viên đã tồn tại.",
}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    manager = commands.add_parser("create-manager", help="Tạo tài khoản Quản lý chung đầu tiên")
    manager.add_argument("--email", required=True)
    manager.add_argument("--full-name", required=True)
    manager.add_argument("--code", required=True, help="Mã nhân viên, vd NV001")
    return parser


def main(argv: list[str] | None = None, *, session_factory: sessionmaker[Session] | None = None) -> int:
    args = _parser().parse_args(sys.argv[1:] if argv is None else argv)
    if not re.fullmatch(EMAIL_PATTERN, args.email.strip()):
        sys.stderr.write("Email không hợp lệ (cần dạng ten@congty.vn).\n")
        return 1
    password = getpass.getpass("Mật khẩu: ")
    if getpass.getpass("Nhập lại mật khẩu: ") != password:
        sys.stderr.write("Mật khẩu nhập lại không khớp.\n")
        return 1
    problems = password_problems(password, current_password="", email=args.email)
    if problems:
        sys.stderr.write("".join(f"{message}\n" for _, message in problems))
        return 1

    if session_factory is None:
        settings = Settings()
        session_factory = create_session_factory(
            create_db_engine(settings.database_url, settings.db_connect_timeout_seconds)
        )
    with session_factory() as session, session.begin():
        result = create_manager(
            session,
            email=args.email,
            full_name=args.full_name,
            code=args.code,
            password=password,
            now=datetime.now(UTC),
        )
    if isinstance(result, Failure):
        sys.stderr.write(f"{_DUPLICATES.get(result, 'Không tạo được tài khoản.')}\n")
        return 1
    sys.stdout.write(f"Đã tạo Quản lý chung {result.code} — {result.full_name}.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

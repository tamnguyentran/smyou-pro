"""M17-04 (Q109): `order.print` is granted to exactly the roles/scopes of `order.read`, and the print
route declares it (AC-ORD-203)."""

import pytest

from app.core.authz import declared_routes
from app.core.spec_loader import load_specs
from app.main import create_app
from tests.spec_fixtures import REPO_SPEC_DIR

PERMISSIONS = load_specs(REPO_SPEC_DIR).permissions


@pytest.mark.ac("AC-ORD-203")
def test_order_print_mirrors_order_read() -> None:
    assert PERMISSIONS.capabilities["order.print"] == PERMISSIONS.capabilities["order.read"]


@pytest.mark.ac("AC-ORD-203")
def test_print_route_declares_order_print() -> None:
    routes = declared_routes(create_app())
    assert ("GET", "/api/v1/orders/{order_id}/invoice-print", "order.print") in routes

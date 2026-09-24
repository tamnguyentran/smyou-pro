import pytest
from fastapi.testclient import TestClient


@pytest.mark.ac("AC-SYS-001")
def test_health_ok_when_database_reachable(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "version": "0.1.0"}

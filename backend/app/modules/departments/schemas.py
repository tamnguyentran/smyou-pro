import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

DepartmentName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: DepartmentName


class DepartmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int
    name: DepartmentName


class DepartmentVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


class DepartmentPage(BaseModel):
    items: list[DepartmentOut]
    total: int
    limit: int
    offset: int

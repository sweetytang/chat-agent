from typing import Any
from uuid import UUID

from pydantic import BaseModel


class CheckpointResponse(BaseModel):
    id: UUID
    thread_id: UUID
    parent_id: UUID | None
    state: dict[str, Any]
    branch_name: str | None

    model_config = {"from_attributes": True}
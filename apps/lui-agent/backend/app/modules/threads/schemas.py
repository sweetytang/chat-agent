from uuid import UUID

from pydantic import BaseModel, Field


class CreateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ThreadResponse(BaseModel):
    id: UUID
    title: str | None
    current_checkpoint_id: UUID | None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: UUID
    thread_id: UUID
    run_id: UUID | None
    checkpoint_id: UUID | None
    role: str
    content: dict

    model_config = {"from_attributes": True}

from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ThreadResponse(BaseModel):
    id: UUID
    title: str | None
    is_pinned: bool
    current_checkpoint_id: UUID | None

    model_config = {"from_attributes": True}


class UpdateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    is_pinned: bool | None = None

    @model_validator(mode="after")
    def validate_update(self) -> UpdateThreadRequest:
        if self.title is None and self.is_pinned is None:
            raise ValueError("至少提供一个可更新字段")
        if self.title is not None:
            self.title = self.title.strip()
            if not self.title:
                raise ValueError("标题不能为空")
        return self


class MessageResponse(BaseModel):
    id: UUID
    thread_id: UUID
    run_id: UUID | None
    checkpoint_id: UUID | None
    role: str
    content: dict

    model_config = {"from_attributes": True}


class BranchOptionResponse(BaseModel):
    checkpoint_id: UUID


class HistoryMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    checkpoint_id: UUID | None
    parent_checkpoint_id: UUID | None
    branch_options: list[BranchOptionResponse] = Field(default_factory=list)
    branch_index: int | None = None


class ThreadHistoryResponse(BaseModel):
    thread_id: UUID
    current_checkpoint_id: UUID | None
    messages: list[HistoryMessageResponse] = Field(default_factory=list)

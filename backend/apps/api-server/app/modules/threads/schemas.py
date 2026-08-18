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

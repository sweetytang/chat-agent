from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class BranchOptionResponse(BaseModel):
    checkpoint_id: UUID


class TimelineItemBase(BaseModel):
    id: str
    kind: str
    run_id: str | None
    sequence: int
    checkpoint_id: UUID | None = None
    parent_checkpoint_id: UUID | None = None
    branch_options: list[BranchOptionResponse] = Field(default_factory=list)
    branch_index: int | None = None


class MessageItemResponse(TimelineItemBase):
    kind: Literal["message"]
    logical_message_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["streaming", "completed", "failed", "cancelled"]
    terminal_segment: bool


class ReasoningItemResponse(TimelineItemBase):
    kind: Literal["reasoning"]
    content: str
    status: Literal["streaming", "completed", "failed", "cancelled"]


class ToolItemResponse(TimelineItemBase):
    kind: Literal["tool"]
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    request_id: str | None = None
    result: Any = None
    status: Literal["running", "awaiting_approval", "completed", "failed", "cancelled"]


class StructuredOutputItemResponse(TimelineItemBase):
    kind: Literal["structured_output"]
    value: Any
    status: Literal["streaming", "completed", "failed", "cancelled"]


class GenerativeUiItemResponse(TimelineItemBase):
    kind: Literal["generative_ui"]
    value: Any
    status: Literal["streaming", "completed", "failed", "cancelled"]


class ErrorItemResponse(TimelineItemBase):
    kind: Literal["error"]
    message: str
    status: Literal["failed"]


TimelineItemResponse = Annotated[
    MessageItemResponse
    | ReasoningItemResponse
    | ToolItemResponse
    | StructuredOutputItemResponse
    | GenerativeUiItemResponse
    | ErrorItemResponse,
    Field(discriminator="kind"),
]


class TimelineSnapshotResponse(BaseModel):
    version: Literal[1]
    items: list[TimelineItemResponse] = Field(default_factory=list)


class ThreadTimelineResponse(BaseModel):
    thread_id: UUID
    current_checkpoint_id: UUID | None
    timeline: TimelineSnapshotResponse

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.models import Checkpoint
from app.modules.mcp.agent import McpToolSnapshot
from app.modules.timeline.domain import TimelineSnapshot, checkpoint_timeline


class RunRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    checkpoint_id: UUID | None = None
    mode: str = Field(default="send", pattern="^(send|edit|regenerate)$")


class ResumeRequest(BaseModel):
    request_id: str = Field(min_length=1)
    decision: str = Field(pattern="^(approve|edit|reject)$")
    payload: dict[str, object] | None = None


@dataclass(frozen=True)
class RunContext:
    checkpoint: Checkpoint | None = None
    input_checkpoint: Checkpoint | None = None

    @property
    def checkpoint_id(self) -> UUID:
        return self.checkpoint.id if self.checkpoint is not None else None

    @property
    def timeline(self) -> TimelineSnapshot:
        return checkpoint_timeline(self.checkpoint)


@dataclass(frozen=True)
class PendingReview:
    run_id: str
    request: RunRequest
    run_context: RunContext | None
    persisted: bool = False
    mcp_snapshot: McpToolSnapshot | None = None
    arguments: dict[str, Any] | None = None
    tool_call_id: str | None = None

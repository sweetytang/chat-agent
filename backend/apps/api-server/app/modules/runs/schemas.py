from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.modules.checkpoints.service import RunBranchContext
from app.modules.mcp.agent import McpToolSnapshot


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
class PendingReview:
    run_id: str
    request: RunRequest
    branch_context: RunBranchContext | None
    persisted: bool = False
    mcp_snapshot: McpToolSnapshot | None = None
    arguments: dict[str, Any] | None = None

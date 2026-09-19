from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from pydantic import BaseModel, Field

from app.db.models import Checkpoint
from app.modules.timeline.domain import TimelineSnapshot, checkpoint_timeline


class RunRequest(BaseModel):
    thread_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    checkpoint_id: UUID | None = None
    mode: str = Field(default="send", pattern="^(send|edit|regenerate)$")
    model: str | None = None
    skill_id: str | None = None
    skill_ids: list[str] = Field(default_factory=list)

    @property
    def effective_skill_ids(self) -> list[str]:
        ids = [s for s in self.skill_ids if s]
        if self.skill_id and self.skill_id not in ids:
            ids.append(self.skill_id)
        return ids


class ResumeRequest(BaseModel):
    request_id: str = Field(min_length=1)
    decision: str = Field(pattern="^(approve|approve_always|edit|reject)$")
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

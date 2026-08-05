from dataclasses import asdict, dataclass
import json
from typing import Any


@dataclass(frozen=True)
class BusinessEvent:
    version: int
    event: str
    run_id: str
    thread_id: str
    sequence: int
    data: dict[str, Any]

    def to_sse(self) -> str:
        payload = json.dumps(asdict(self), ensure_ascii=False, separators=(",", ":"))
        return f"event: {self.event}\ndata: {payload}\n\n"

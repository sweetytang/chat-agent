from dataclasses import asdict, dataclass
import json
from typing import Any


@dataclass(frozen=True)
class RuntimeEvent:
    """运行时事件"""

    version: int
    event: str
    run_id: str
    thread_id: str
    sequence: int
    data: dict[str, Any]

    def to_sse(self) -> str:
            return encode_sse(self)


def encode_sse(event: RuntimeEvent) -> str:
    """将运行时事件编码为 SSE；HTTP 层应调用此函数。"""

    payload = json.dumps(asdict(event), ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.event}\ndata: {payload}\n\n"
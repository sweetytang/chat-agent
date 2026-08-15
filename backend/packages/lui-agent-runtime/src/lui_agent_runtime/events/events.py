from dataclasses import asdict, dataclass
import json
from typing import Any


@dataclass(frozen=True)
class RuntimeEvent:
    """与传输协议无关的运行时事件。"""

    version: int
    event: str
    run_id: str
    thread_id: str
    sequence: int
    data: dict[str, Any]


def encode_sse(event: RuntimeEvent) -> str:
    """将运行时事件编码为 SSE；HTTP 层应调用此函数。"""

    payload = json.dumps(asdict(event), ensure_ascii=False, separators=(",", ":"))
    return f"event: {event.event}\ndata: {payload}\n\n"


@dataclass(frozen=True)
class BusinessEvent(RuntimeEvent):
    """历史业务事件投影，保留 ``to_sse`` 兼容合同。"""

    def to_sse(self) -> str:
        return encode_sse(self)

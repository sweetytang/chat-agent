from enum import StrEnum
from typing import ClassVar


class McpConnectionState(StrEnum):
    DISABLED = "DISABLED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DEGRADED = "DEGRADED"
    ERROR = "ERROR"


class McpStateMachine:
    _allowed: ClassVar[dict[McpConnectionState, set[McpConnectionState]]] = {
        McpConnectionState.DISABLED: {McpConnectionState.CONNECTING},
        McpConnectionState.CONNECTING: {
            McpConnectionState.CONNECTED,
            McpConnectionState.DEGRADED,
            McpConnectionState.ERROR,
            McpConnectionState.DISABLED,
        },
        McpConnectionState.CONNECTED: {
            McpConnectionState.DEGRADED,
            McpConnectionState.ERROR,
            McpConnectionState.DISABLED,
        },
        McpConnectionState.DEGRADED: {
            McpConnectionState.CONNECTING,
            McpConnectionState.CONNECTED,
            McpConnectionState.ERROR,
            McpConnectionState.DISABLED,
        },
        McpConnectionState.ERROR: {
            McpConnectionState.CONNECTING,
            McpConnectionState.DISABLED,
        },
    }

    def __init__(self, state: McpConnectionState = McpConnectionState.DISABLED) -> None:
        self.state = state

    def transition(self, target: McpConnectionState) -> McpConnectionState:
        # 状态刷新可能重复到达；重复设置是幂等操作。
        if target is self.state:
            return self.state
        if target not in self._allowed[self.state]:
            raise ValueError(f"非法 MCP 状态转换: {self.state} -> {target}")
        self.state = target
        return self.state

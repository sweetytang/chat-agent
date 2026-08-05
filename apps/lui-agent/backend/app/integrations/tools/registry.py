import ast
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
import operator
from typing import Any


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass(frozen=True)
class ToolResult:
    tool_call_id: str
    name: str
    content: dict[str, Any]
    requires_approval: bool = False


ToolHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]


class ToolRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, tuple[ToolHandler, bool]] = {}

    def register(self, name: str, handler: ToolHandler, *, requires_approval: bool = True) -> None:
        self._handlers[name] = (handler, requires_approval)

    def is_registered(self, name: str) -> bool:
        return name in self._handlers

    def requires_approval(self, name: str) -> bool:
        return self._handlers[name][1]

    async def execute(self, call: ToolCall) -> ToolResult:
        handler, requires_approval = self._handlers[call.name]
        return ToolResult(call.id, call.name, await handler(call.args), requires_approval)


_OPERATORS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}


def calculate(expression: str) -> float:
    """仅允许数字和四则运算，避免旧实现中的 eval 风险。"""

    def evaluate(node: ast.AST) -> float:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.BinOp) and type(node.op) in _OPERATORS:
            return _OPERATORS[type(node.op)](evaluate(node.left), evaluate(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = evaluate(node.operand)
            return value if isinstance(node.op, ast.UAdd) else -value
        raise ValueError("只支持数字和四则运算")

    tree = ast.parse(expression, mode="eval")
    return evaluate(tree.body)


async def weather(args: dict[str, Any]) -> dict[str, Any]:
    """默认 fake weather，真实 provider 可在应用启动时替换同名 handler。"""
    city = str(args.get("city", "未知城市"))
    return {"city": city, "condition": "晴", "temperature_c": 22}


async def web_search(args: dict[str, Any]) -> dict[str, Any]:
    """默认 fake search，保证自动化测试不访问外网。"""
    query = str(args.get("query", ""))
    return {"query": query, "results": []}


def default_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register("weather", weather, requires_approval=False)
    registry.register("web_search", web_search, requires_approval=True)
    return registry

"""运行时的 Demo 快捷规则与 Mock 策略。"""

from __future__ import annotations

from collections.abc import AsyncIterator
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.timeline.recorder import TimelineRecorder
from lui_agent_runtime.events import RuntimeEvent
from .dependencies import RunDependencies
from .schemas import RunRequest, RunBranchContext
from .interrupts import create_approval_interrupt


def is_shortcut_rule(prompt_content: str) -> bool:
    """检查用户输入是否命中了本地演示快捷指令。"""
    if re.fullmatch(r"(?:calc|计算)(?::|：)?\s*(.+)", prompt_content, re.IGNORECASE):
        return True
    return prompt_content.startswith(("json:", "ui:"))


async def handle_reasoning_shortcut(
    recorder: TimelineRecorder,
    *,
    run_id: str,
    thread_id: str,
    prompt_content: str,
    sequence: int,
) -> AsyncIterator[tuple[str, int]]:
    """若用户输入以 think:/思考: 开头，先产出一条模拟思考增量事件。"""
    if prompt_content.startswith(("think:", "思考：")):
        sequence += 1
        event = recorder.record(
            run_id,
            thread_id,
            sequence,
            "reasoning.delta",
            item_id=f"{run_id}:reasoning:0",
            content="正在分析请求并选择合适的执行路径。",
        )
        yield event.to_sse(), sequence


async def execute_shortcut_rule(
    recorder: TimelineRecorder,
    run_dependencies: RunDependencies,
    *,
    run_id: str,
    thread_id: str,
    prompt_content: str,
    sequence: int,
) -> AsyncIterator[tuple[str, int, str]]:
    """执行 calc / json / ui 等本地快捷规则。
    
    yield: (sse_text, current_sequence, assistant_reply_text)
    """
    reply = "收到你的消息。"

    # 1. 计算器快捷指令 (calc: / 计算：)
    calculator_match = re.fullmatch(
        r"(?:calc|计算)(?::|：)?\s*(.+)", prompt_content, re.IGNORECASE
    )
    if calculator_match:
        expression = calculator_match.group(1)
        tool_call_id = f"{run_id}:tool:calculator:0"
        sequence += 1
        yield (
            recorder.record(
                run_id,
                thread_id,
                sequence,
                "tool.call",
                tool_call_id=tool_call_id,
                tool="calculator",
                arguments={"expression": expression},
            ).to_sse(),
            sequence,
            reply,
        )
        try:
            calculated_value = run_dependencies.calculate(expression)
            reply = f"计算结果：{calculated_value:g}"
            tool_data: dict[str, Any] = {
                "tool": "calculator",
                "content": {"result": calculated_value},
            }
        except (SyntaxError, ValueError, ZeroDivisionError) as error:
            reply = f"计算失败：{error}"
            tool_data = {"tool": "calculator", "content": {"error": str(error)}}

        sequence += 1
        yield (
            recorder.record(
                run_id,
                thread_id,
                sequence,
                "tool.result",
                tool_call_id=tool_call_id,
                **tool_data,
            ).to_sse(),
            sequence,
            reply,
        )

    # 2. 结构化输出卡片 (json:)
    if prompt_content.startswith("json:"):
        sequence += 1
        yield (
            recorder.record(
                run_id,
                thread_id,
                sequence,
                "structured_output.delta",
                item_id=f"{run_id}:structured:{sequence}",
                value={"type": "text", "value": prompt_content.removeprefix("json:").strip()},
            ).to_sse(),
            sequence,
            reply,
        )

    # 3. 动态 UI 组件卡片 (ui:)
    if prompt_content.startswith("ui:"):
        text = prompt_content.removeprefix("ui:").strip()
        sequence += 1
        yield (
            recorder.record(
                run_id,
                thread_id,
                sequence,
                "generative_ui.delta",
                item_id=f"{run_id}:generative-ui:{sequence}",
                value={"component": "NoticeCard", "props": {"text": text}},
                component="NoticeCard",
                props={"text": text},
            ).to_sse(),
            sequence,
            reply,
        )


async def handle_search_interrupt_shortcut(
    session: AsyncSession | None,
    recorder: TimelineRecorder,
    *,
    run_id: str,
    thread_id: str,
    request: RunRequest,
    branch_context: RunBranchContext | None,
    prompt_content: str,
    sequence: int,
) -> tuple[RuntimeEvent, RuntimeEvent, int] | None:
    """如果输入命中 search:/搜索: 前缀，创建搜索审批中断并返回待发送的事件。
    
    若未命中返回 None；若命中返回 (tool_call_event, approval_event, next_sequence)。
    """
    if not prompt_content.startswith(("search:", "搜索：")):
        return None

    query = prompt_content.split(":", 1)[-1].strip()
    return await create_approval_interrupt(
        session,
        recorder,
        run_id=run_id,
        thread_id=thread_id,
        request=request,
        branch_context=branch_context,
        sequence=sequence,
        kind="tool",
        tool_name="web_search",
        arguments={"query": query},
        extra_payload={"query": query},
    )


__all__ = [
    "execute_shortcut_rule",
    "handle_reasoning_shortcut",
    "handle_search_interrupt_shortcut",
    "is_shortcut_rule",
]

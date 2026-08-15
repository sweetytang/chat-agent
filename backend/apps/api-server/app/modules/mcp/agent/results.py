"""MCP Tool Result 到业务事件数据的统一转换。"""

from __future__ import annotations

from typing import Any


def normalize_tool_result(result: Any) -> dict[str, Any]:
    """保留 V1 支持的 content blocks，并对未知 block 稳定降级。"""
    blocks = result.get("content") if isinstance(result, dict) and "content" in result else result
    if not isinstance(blocks, list):
        return {"kind": "structured" if isinstance(blocks, dict) else "text", "content": blocks}
    normalized: list[dict[str, Any]] = []
    for block in blocks:
        if not isinstance(block, dict):
            normalized.append({"type": "text", "text": str(block)})
            continue
        block_type = block.get("type")
        if block_type == "text":
            normalized.append(
                {key: value for key, value in block.items() if key in {"type", "text"}}
            )
        elif block_type in {"image", "audio"}:
            # 对象存储未接入调用链时必须受控拒绝，禁止把 base64 写入 SSE/数据库。
            normalized.append(
                {
                    "type": "unsupported",
                    "original_type": block_type,
                    "error": "MCP 二进制对象存储未配置",
                }
            )
        elif block_type == "resource_link":
            normalized.append(
                {"type": "resource_link", "uri": block.get("uri"), "name": block.get("name")}
            )
        else:
            normalized.append(
                {"type": "unsupported", "original_type": str(block_type or "unknown")}
            )
    return {"kind": "content_blocks", "content": normalized}

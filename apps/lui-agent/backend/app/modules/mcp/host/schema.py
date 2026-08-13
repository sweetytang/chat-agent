"""面向 LLM 的安全 Schema 投影。"""
from __future__ import annotations

from typing import Any


def project_input_schema(schema: Any) -> tuple[dict[str, Any], str | None]:
    """仅保留无歧义 JSON Schema，无法投影时返回原因。"""
    if not isinstance(schema, dict):
        return {}, "inputSchema 不是对象"
    schema_type = schema.get("type", "object")
    if schema_type != "object":
        return {}, "工具参数必须是 object schema"
    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        return {}, "properties 不是对象"
    projected: dict[str, Any] = {"type": "object", "properties": {}}
    for name, value in properties.items():
        if not isinstance(name, str) or not isinstance(value, dict):
            return {}, "参数 schema 不可兼容"
        # Provider 不支持任意扩展关键词，但保留核心约束。
        item = {key: value[key] for key in ("type", "description", "enum", "items") if key in value}
        if "type" not in item:
            return {}, "参数缺少 type"
        projected["properties"][name] = item
    if isinstance(schema.get("required"), list):
        projected["required"] = [item for item in schema["required"] if item in properties]
    return projected, None

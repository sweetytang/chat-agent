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
        # GitHub 等成熟 MCP 会用 $ref/anyOf 表达 nullable 或复合参数。
        # 不把未知关键词原样交给 Provider，只保留可安全理解的约束；
        # 缺少顶层 type 并不等于不兼容。
        item = {
            key: value[key]
            for key in ("type", "description", "enum", "items", "default")
            if key in value
        }
        if "type" not in item:
            variants = value.get("anyOf") or value.get("oneOf")
            if isinstance(variants, list):
                types = [entry.get("type") for entry in variants if isinstance(entry, dict)]
                types = [entry for entry in types if isinstance(entry, str)]
                if types:
                    item["type"] = types[0] if len(set(types)) == 1 else "string"
            elif "$ref" in value:
                item["type"] = "object"
        if "type" not in item:
            item["type"] = "string"
        projected["properties"][name] = item
    if isinstance(schema.get("required"), list):
        projected["required"] = [item for item in schema["required"] if item in properties]
    return projected, None

"""从已导出的 OpenAPI schema 生成前端 DTO 类型。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
SCHEMA_FILE = ROOT / "openapi.json"
OUTPUT_FILE = ROOT / "src/openapi.d.ts"


def ref_type(value: str) -> str:
    return f'components["schemas"]["{value.rsplit("/", 1)[-1]}"]'


def type_for(schema: dict[str, Any] | None) -> str:
    if not schema:
        return "unknown"
    if "$ref" in schema:
        return ref_type(schema["$ref"])
    if "anyOf" in schema:
        return " | ".join(type_for(item) for item in schema["anyOf"])
    if "oneOf" in schema:
        return " | ".join(type_for(item) for item in schema["oneOf"])
    if "allOf" in schema:
        return " & ".join(type_for(item) for item in schema["allOf"])
    if "enum" in schema:
        return " | ".join(json.dumps(value, ensure_ascii=False) for value in schema["enum"])
    if schema.get("type") == "array":
        return f"Array<{type_for(schema.get('items'))}>"
    if schema.get("type") == "object":
        additional = schema.get("additionalProperties")
        if not schema.get("properties"):
            return f"Record<string, {type_for(additional) if isinstance(additional, dict) else 'unknown'}>"
        return "{ " + "; ".join(
            f"{name}{'' if name in schema.get('required', []) else '?'}: {type_for(value)}"
            for name, value in schema["properties"].items()
        ) + " }"
    return {
        "string": "string",
        "integer": "number",
        "number": "number",
        "boolean": "boolean",
        "null": "null",
    }.get(schema.get("type"), "unknown")


def response_type(response: dict[str, Any]) -> str:
    content = response.get("content", {})
    if not content:
        return "never"
    first = next(iter(content.values()))
    return type_for(first.get("schema"))


def generate(document: dict[str, Any]) -> str:
    lines = [
        "/**",
        " * 由 backend FastAPI OpenAPI schema 生成。",
        " * 请运行 make generate-api-types 刷新，不要手工修改。",
        " */",
        "",
        "export interface paths {",
    ]
    operations: list[tuple[str, dict[str, Any]]] = []
    for path, path_item in document.get("paths", {}).items():
        lines.append(f'  "{path}": {{')
        for method, operation in path_item.items():
            if method.startswith("x"):
                continue
            operation_id = operation["operationId"]
            operations.append((operation_id, operation))
            lines.append(f'    {method}: operations["{operation_id}"];')
        lines.append("  };")
    lines.extend(["}", "", "export interface components {", "  schemas: {"])
    for name, schema in document.get("components", {}).get("schemas", {}).items():
        if schema.get("type") == "object" and schema.get("properties"):
            lines.append(f"    {name}: {{")
            required = set(schema.get("required", []))
            for field, field_schema in schema["properties"].items():
                optional = "" if field in required else "?"
                lines.append(f"      {field}{optional}: {type_for(field_schema)};")
            lines.append("    };")
        else:
            lines.append(f"    {name}: {type_for(schema)};")
    lines.extend(["  };", "}", "", "export interface operations {"])
    for operation_id, operation in operations:
        lines.extend([f"  {operation_id}: {{"])
        parameters = operation.get("parameters", [])
        if parameters:
            lines.append("    parameters: {")
            for parameter in parameters:
                location = parameter["in"]
                required = "" if parameter.get("required") else "?"
                lines.append(f"      {location}: {{")
                lines.append(f"        {parameter['name']}{required}: {type_for(parameter.get('schema'))};")
                lines.append("      };")
            lines.append("    };")
        request = operation.get("requestBody", {}).get("content", {}).get("application/json")
        if request:
            lines.extend(["    requestBody: {", f"      content: {{", f"        \"application/json\": {type_for(request.get('schema'))};", "      };", "    };"])
        lines.append("    responses: {")
        for status, response in operation.get("responses", {}).items():
            lines.append(f"      {status}: {{")
            body = response_type(response)
            if body != "never":
                lines.append(f"        content: {{ \"application/json\": {body} }};")
            lines.append("      };")
        lines.extend(["    };", "  };"])
    lines.extend(["}", ""])
    return "\n".join(lines)


OUTPUT_FILE.write_text(generate(json.loads(SCHEMA_FILE.read_text())), encoding="utf-8")

from __future__ import annotations

import re

import yaml

_FRONTMATTER_PATTERN = re.compile(r"^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$", re.DOTALL)


def parse_skill_markdown(
    raw_text: str,
    *,
    fallback_name: str | None = None,
    fallback_description: str | None = None,
) -> tuple[str, str, str]:
    """解析 SKILL.md 格式，提取 (name, description, content)。

    标准格式：
    ---
    name: skill-name
    description: brief trigger description
    ---
    Markdown content...
    """
    text = raw_text.strip()
    match = _FRONTMATTER_PATTERN.match(text)

    name = fallback_name
    description = fallback_description
    content = text

    if match:
        yaml_block, body = match.groups()
        content = body.strip()
        try:
            parsed = yaml.safe_load(yaml_block)
            if isinstance(parsed, dict):
                if not name and parsed.get("name"):
                    name = str(parsed["name"]).strip()
                if not description and parsed.get("description"):
                    description = str(parsed["description"]).strip()
        except Exception:
            pass

    if not name:
        # 尝试从正文首个一级标题提取
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if title_match:
            name = title_match.group(1).strip()

    if not description:
        # 尝试使用正文首段非空文本作为描述
        paragraphs = [
            p.strip() for p in content.split("\n\n") if p.strip() and not p.strip().startswith("#")
        ]
        if paragraphs:
            description = paragraphs[0][:200].strip()

    if not name:
        raise ValueError("无法解析技能名称 (name)，请在 frontmatter 中提供 name 字段")
    if not description:
        raise ValueError("无法解析技能描述 (description)，请在 frontmatter 中提供 description 字段")
    if not content:
        raise ValueError("技能正文内容不能为空")

    return name, description, content

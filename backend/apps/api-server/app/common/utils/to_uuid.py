from __future__ import annotations

from uuid import UUID


def to_uuid(value: str | None) -> UUID | None:
    """安全解析 UUID，若为非法格式（如 'demo-thread' 或 None），安全返回 None，绝不抛异常。"""
    
    if not value:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None

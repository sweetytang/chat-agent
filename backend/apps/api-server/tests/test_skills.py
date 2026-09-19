from uuid import uuid4

import pytest

from app.db.models import Skill
from app.main import app
from app.modules.skills.context import inject_system_message, prepare_skill_context
from app.modules.skills.domain.parser import parse_skill_markdown
from app.modules.skills.tool import build_load_skill_tool
from tests.route_helpers import route_paths


def test_skills_routes_are_exposed() -> None:
    routes = route_paths(app)

    assert {
        "/api/skills",
        "/api/skills/import",
        "/api/skills/{skill_id}",
    } <= routes


def test_parse_skill_markdown_with_valid_frontmatter() -> None:
    raw = """---
name: react-expert
description: React 组件与性能优化
---

# React 专家指南
组件设计原则与规范...
"""
    name, description, content = parse_skill_markdown(raw)
    assert name == "react-expert"
    assert description == "React 组件与性能优化"
    assert "# React 专家指南" in content
    assert "组件设计原则与规范" in content


def test_parse_skill_markdown_without_frontmatter_fallback() -> None:
    raw = """# SQL 优化助手

专门用于诊断 MySQL / PostgreSQL 慢查询并给出索引建议。

## 执行准则
1. 检查 EXPLAIN 输出
2. 避免全表扫描
"""
    name, description, content = parse_skill_markdown(raw)
    assert name == "SQL 优化助手"
    assert "专门用于诊断" in description
    assert "## 执行准则" in content


def test_parse_skill_markdown_empty_fails() -> None:
    with pytest.raises(ValueError, match="无法解析技能名称"):
        parse_skill_markdown("")


def test_build_load_skill_tool_execution() -> None:
    skills_map = {
        "react-expert": "这是 React 规范正文",
        "sql-helper": "这是 SQL 规范正文",
    }
    tool = build_load_skill_tool(skills_map)
    assert tool.name == "load_skill"

    # 1. 成功查阅
    result = tool.invoke({"name": "react-expert"})
    assert "【技能手册: react-expert】" in result
    assert "这是 React 规范正文" in result
    assert "沙箱 Web Agent" in result

    # 2. 查阅不存在的技能
    not_found = tool.invoke({"name": "non-existent"})
    assert "未找到名为 'non-existent' 的技能手册" in not_found


def test_inject_system_message_prepends_or_merges() -> None:
    from langchain_core.messages import HumanMessage, SystemMessage

    # 1. 空 system_prompt
    msgs = [HumanMessage(content="hello")]
    assert inject_system_message(msgs, None) == msgs

    # 2. 注入新 SystemMessage 到首位
    injected = inject_system_message(msgs, "系统设定")
    assert len(injected) == 2
    assert isinstance(injected[0], SystemMessage)
    assert injected[0].content == "系统设定"
    assert injected[1].content == "hello"

    # 3. 若已有 SystemMessage 则合并
    existing = [SystemMessage(content="原系统指令"), HumanMessage(content="hello")]
    merged = inject_system_message(existing, "额外技能")
    assert len(merged) == 2
    assert isinstance(merged[0], SystemMessage)
    assert merged[0].content == "额外技能\n\n原系统指令"


class MockSkillResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        class S:
            def __init__(self, it):
                self._it = it

            def all(self):
                return self._it

        return S(self._items)

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class MockDbSession:
    def __init__(self, skills=None):
        self.skills = skills or []

    async def execute(self, statement):
        # 简单模拟返回 skills
        return MockSkillResult(self.skills)


@pytest.mark.asyncio
async def test_prepare_skill_context_manual_b() -> None:
    user_id = uuid4()
    skill_id = uuid4()
    skill = Skill(
        id=skill_id,
        user_id=user_id,
        name="test-skill",
        description="测试技能",
        content="规范内容...",
        enabled=True,
    )
    session = MockDbSession([skill])

    prompt, tools = await prepare_skill_context(session, user_id, skill_ids=[skill_id])
    assert prompt is not None
    assert "【当前专精技能指导规范: test-skill】" in prompt
    assert "规范内容..." in prompt
    assert tools == []


@pytest.mark.asyncio
async def test_prepare_skill_context_multiple_skills() -> None:
    user_id = uuid4()
    s1 = Skill(id=uuid4(), user_id=user_id, name="s1", description="d1", content="c1", enabled=True)
    s2 = Skill(id=uuid4(), user_id=user_id, name="s2", description="d2", content="c2", enabled=True)
    session = MockDbSession([s1, s2])

    prompt, tools = await prepare_skill_context(session, user_id, skill_ids=[s1.id, s2.id])
    assert prompt is not None
    assert "【当前专精技能指导规范: s1】" in prompt
    assert "c1" in prompt
    assert "【当前专精技能指导规范: s2】" in prompt
    assert "c2" in prompt
    assert tools == []


@pytest.mark.asyncio
async def test_prepare_skill_context_auto_c() -> None:
    user_id = uuid4()
    s1 = Skill(
        id=uuid4(),
        user_id=user_id,
        name="s1",
        description="技能1描述",
        content="正文1",
        enabled=True,
    )
    session = MockDbSession([s1])

    prompt, tools = await prepare_skill_context(session, user_id, skill_ids=None)
    assert prompt is not None
    assert "你拥有以下专业技能手册可供查阅" in prompt
    assert "- s1: 技能1描述" in prompt
    assert len(tools) == 1
    assert tools[0].name == "load_skill"


@pytest.mark.asyncio
async def test_prepare_skill_context_empty() -> None:
    user_id = uuid4()
    session = MockDbSession([])

    prompt, tools = await prepare_skill_context(session, user_id, skill_ids=None)
    assert prompt is None
    assert tools == []

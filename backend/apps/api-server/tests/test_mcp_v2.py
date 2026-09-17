"""测试极简 MCP 路由与命令安全校验。"""

from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import Base
from app.db.models import User, UserMcpServer
from app.modules.mcp.router import (
    create_user_mcp_server,
    delete_user_mcp_server,
    list_user_mcp_servers,
    sync_mcp_json_config,
    update_user_mcp_server,
)
from app.modules.mcp.schemas import (
    McpConfigSyncRequest,
    UserMcpServerCreate,
    UserMcpServerUpdate,
)
from app.modules.mcp.security import validate_stdio_command
from fastapi import HTTPException


class SyncSessionAdapter:
    def __init__(self, session: Session) -> None:
        self.session = session

    async def execute(self, statement):
        return self.session.execute(statement)

    def add(self, instance) -> None:
        self.session.add(instance)

    def add_all(self, instances) -> None:
        self.session.add_all(instances)

    async def delete(self, instance) -> None:
        self.session.delete(instance)

    async def commit(self) -> None:
        self.session.commit()

    async def refresh(self, instance) -> None:
        self.session.refresh(instance)


def test_stdio_security_disallowed_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "enable_local_mcp", False)
    with pytest.raises(HTTPException) as exc_info:
        validate_stdio_command("npx", ["-y", "some-mcp"])
    assert exc_info.value.status_code == 403
    assert "未开启本地" in exc_info.value.detail


def test_stdio_security_rejects_shell_roots(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "enable_local_mcp", True)
    with pytest.raises(HTTPException) as exc_info:
        validate_stdio_command("bash", ["-c", "echo 1"])
    assert exc_info.value.status_code == 400
    assert "禁止直接使用" in exc_info.value.detail


def test_stdio_security_rejects_injections(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "enable_local_mcp", True)
    with pytest.raises(HTTPException) as exc_info:
        validate_stdio_command("npx", ["arg1; rm -rf /"])
    assert exc_info.value.status_code == 400
    assert "包含非法字符" in exc_info.value.detail


@pytest.mark.asyncio
async def test_mcp_json_sync_and_crud(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "enable_local_mcp", True)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    user_id = uuid4()

    with Session(engine) as session:
        user = User(id=user_id, email="mcp@example.com", password_hash="hash")
        session.add(user)
        session.commit()

        adapter = SyncSessionAdapter(session)

        # 1. 全量同步 json
        sync_req = McpConfigSyncRequest(
            mcpServers={
                "weather": {
                    "url": "https://example.com/sse",
                    "transport": "sse",
                    "headers": {"Authorization": "Bearer token"},
                    "enabled": True,
                    "tools": {"get_weather": {"enabled": True, "require_approval": False}},
                },
                "local-db": {
                    "command": "npx",
                    "args": ["-y", "@modelcontextprotocol/server-sqlite"],
                    "enabled": True,
                },
            }
        )
        saved = await sync_mcp_json_config(sync_req, user=user, session=adapter)
        assert len(saved) == 2
        assert {s.name for s in saved} == {"weather", "local-db"}

        # 2. 读取列表
        listed = await list_user_mcp_servers(user=user, session=adapter)
        assert len(listed) == 2

        # 3. 更新
        weather_server = next(s for s in listed if s.name == "weather")
        updated = await update_user_mcp_server(
            weather_server.id,
            UserMcpServerUpdate(enabled=False),
            user=user,
            session=adapter,
        )
        assert updated.enabled is False

        # 4. 删除
        await delete_user_mcp_server(weather_server.id, user=user, session=adapter)
        remaining = await list_user_mcp_servers(user=user, session=adapter)
        assert len(remaining) == 1
        assert remaining[0].name == "local-db"

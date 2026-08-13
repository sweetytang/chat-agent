from uuid import uuid4

from fastapi import HTTPException
import pytest
from sqlalchemy import select
from sqlalchemy.dialects.postgresql.asyncpg import PGDialect_asyncpg

from app.db.models import (
    McpScope,
    McpServerDefinition,
    McpServerStatus,
    McpTool,
    McpTransport,
    McpUserServer,
    User,
    UserRole,
)
from app.modules.mcp.host.client import McpHost, McpToolDescriptor
from app.modules.mcp.router import (
    TogglePayload,
    list_servers,
    refresh_server,
    set_server_enabled,
    set_tool_enabled,
)


class Rows:
    def __init__(self, rows=()) -> None:
        self._rows = list(rows)

    def all(self):
        return self._rows


class FakeSession:
    def __init__(self, *, objects=(), rows=(), scalar_values=(), scalars_values=()) -> None:
        self.objects = {(type(item), item.id): item for item in objects}
        self.rows = rows
        self.scalar_values = list(scalar_values)
        self.scalars_values = list(scalars_values)
        self.statements = []
        self.added = []
        self.commits = 0

    async def get(self, model, item_id):
        return self.objects.get((model, item_id))

    async def execute(self, statement):
        self.statements.append(statement)
        return Rows(self.rows)

    async def scalar(self, _statement):
        return self.scalar_values.pop(0) if self.scalar_values else None

    async def scalars(self, _statement):
        values = self.scalars_values.pop(0) if self.scalars_values else []
        return Rows(values)

    def add(self, item):
        self.added.append(item)

    async def commit(self):
        self.commits += 1


def user(*, role: UserRole = UserRole.USER) -> User:
    return User(id=uuid4(), email=f"{uuid4()}@example.com", password_hash="hash", role=role)


def server(owner_id, *, scope: McpScope = McpScope.PRIVATE) -> McpServerDefinition:
    return McpServerDefinition(
        id=uuid4(),
        owner_id=owner_id,
        name="MCP",
        scope=scope,
        transport=McpTransport.STREAMABLE_HTTP,
        endpoint="https://example.com/mcp",
        approved_config={},
        status=McpServerStatus.DISABLED,
        security_version=1,
    )


def test_mcp_varchar_enums_do_not_emit_postgres_enum_casts() -> None:
    query = select(McpServerDefinition).where(McpServerDefinition.scope == McpScope.SHARED)
    compiled = str(query.compile(dialect=PGDialect_asyncpg()))

    assert "::mcp_scope" not in compiled
    assert McpServerDefinition.__table__.c.scope.type.native_enum is False
    assert McpServerDefinition.__table__.c.transport.type.native_enum is False
    assert McpServerDefinition.__table__.c.status.type.native_enum is False
    assert User.__table__.c.role.type.native_enum is False


@pytest.mark.asyncio
async def test_list_servers_returns_persisted_user_state() -> None:
    current = user()
    definition = server(current.id)
    binding = McpUserServer(
        id=uuid4(),
        user_id=current.id,
        server_id=definition.id,
        enabled=True,
        last_error="连接超时",
    )

    response = await list_servers(user=current, session=FakeSession(rows=[(definition, binding)]))

    assert response[0].enabled is True
    assert response[0].last_error == "连接超时"
    assert response[0].status == "DISABLED"


@pytest.mark.asyncio
async def test_server_toggle_is_idempotent_postgres_upsert() -> None:
    current = user()
    definition = server(current.id)
    session = FakeSession(objects=[definition])

    response = await set_server_enabled(
        definition.id,
        TogglePayload(enabled=False),
        user=current,
        session=session,
        host=McpHost(None),
    )
    statement = str(session.statements[0].compile(dialect=PGDialect_asyncpg()))

    assert response == {"enabled": False}
    assert "ON CONFLICT ON CONSTRAINT uq_mcp_user_server DO UPDATE" in statement
    assert session.commits == 2


@pytest.mark.asyncio
async def test_tool_toggle_rejects_other_users_private_tool() -> None:
    owner = user()
    attacker = user()
    definition = server(owner.id)
    tool = McpTool(
        id=uuid4(),
        server_id=definition.id,
        remote_name="search",
        internal_name="mcp__private__search",
        input_schema={},
        annotations={},
        compatibility="COMPATIBLE",
        is_present=True,
    )

    with pytest.raises(HTTPException) as caught:
        await set_tool_enabled(
            tool.id,
            TogglePayload(enabled=True),
            user=attacker,
            session=FakeSession(objects=[definition, tool]),
        )

    assert caught.value.status_code == 404


@pytest.mark.asyncio
async def test_tool_toggle_rejects_missing_or_incompatible_tool() -> None:
    current = user()
    definition = server(current.id)
    tool = McpTool(
        id=uuid4(),
        server_id=definition.id,
        remote_name="search",
        internal_name="mcp__private__search",
        input_schema={},
        annotations={},
        compatibility="INCOMPATIBLE",
        is_present=True,
    )

    with pytest.raises(HTTPException) as caught:
        await set_tool_enabled(
            tool.id,
            TogglePayload(enabled=True),
            user=current,
            session=FakeSession(objects=[definition, tool]),
        )

    assert caught.value.status_code == 409


@pytest.mark.asyncio
async def test_refresh_syncs_catalog_and_returns_connected_state() -> None:
    class Host(McpHost):
        async def connect(self, server_id, *, endpoint, headers=None):
            assert endpoint == "https://example.com/mcp"
            assert headers == {}
            return (
                McpToolDescriptor(
                    server_id,
                    "search",
                    "搜索",
                    {"type": "object", "properties": {"q": {"type": "string"}}},
                    {"readOnlyHint": True},
                ),
            )

    current = user()
    definition = server(current.id)
    binding = McpUserServer(id=uuid4(), user_id=current.id, server_id=definition.id, enabled=True)
    session = FakeSession(
        objects=[definition],
        scalar_values=[binding, binding],
        scalars_values=[[]],
    )

    response = await refresh_server(definition.id, user=current, session=session, host=Host(None))

    assert response.status == "CONNECTED"
    assert response.enabled is True
    assert response.last_error is None
    assert session.commits == 1
    assert len(session.added) == 1
    assert isinstance(session.added[0], McpTool)
    assert session.added[0].remote_name == "search"
    assert session.added[0].compatibility == "COMPATIBLE"

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()
engine: AsyncEngine | None = None
async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global engine, async_session_factory
    if async_session_factory is None:
        engine = create_async_engine(
            str(settings.database_url),
            echo=True,
            pool_pre_ping=True,
        )
        async_session_factory = async_sessionmaker(engine, expire_on_commit=False)
    assert async_session_factory is not None
    return async_session_factory


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


async def get_optional_db_session() -> AsyncIterator[AsyncSession | None]:
    """允许无数据库驱动的协议测试运行；真实部署仍使用 PostgreSQL。"""
    try:
        factory = get_session_factory()
    except ModuleNotFoundError:
        yield None
        return
    async with factory() as session:
        yield session

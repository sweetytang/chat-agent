from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.checkpoints import router as checkpoints_router
from app.api.interrupts import (
    router as interrupts_router,
    thread_router as thread_interrupts_router,
)
from app.api.runs import router as runs_router
from app.api.threads import router as threads_router
from app.core.config import get_settings
from app.modules.mcp.dependencies import configure_mcp_host
from app.modules.mcp.host.client import McpClientFactory, McpHost
from app.modules.mcp.router import router as mcp_router
from app.modules.runs.dependencies import run_dependencies_manager
from app.modules.skills.router import router as skills_router


def create_app() -> FastAPI:
    settings = get_settings()
    configure_mcp_host(McpHost(McpClientFactory()))
    run_dependencies_manager.configure_run_dependencies()

    application = FastAPI(title=settings.app_name, version="0.1.0")
    cors_kwargs: dict = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if settings.cors_allow_all:
        cors_kwargs["allow_origin_regex"] = r"^https?://.*$"
    elif settings.cors_origin_regex:
        cors_kwargs["allow_origin_regex"] = settings.cors_origin_regex
        cors_kwargs["allow_origins"] = settings.cors_origins
    else:
        cors_kwargs["allow_origins"] = settings.cors_origins

    application.add_middleware(CORSMiddleware, **cors_kwargs)

    @application.get("/health", tags=["system"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok"}

    application.include_router(runs_router)
    application.include_router(auth_router)
    application.include_router(threads_router)
    application.include_router(interrupts_router)
    application.include_router(thread_interrupts_router)
    application.include_router(checkpoints_router)
    application.include_router(mcp_router)
    application.include_router(skills_router)

    return application

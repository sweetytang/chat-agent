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


def create_app() -> FastAPI:
    settings = get_settings()
    configure_mcp_host(McpHost(McpClientFactory()))
    run_dependencies_manager.configure_run_dependencies()

    application = FastAPI(title=settings.app_name, version="0.1.0")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:8001",
            "http://127.0.0.1:8001",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://ai.tenasourcing.com",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

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

    return application

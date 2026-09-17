"""MCP 本地执行安全策略与命令校验。"""

from __future__ import annotations

from collections.abc import Sequence
import os

from fastapi import HTTPException, status

from app.core.config import get_settings

_DANGEROUS_SHELL_INJECTIONS = (";", "&&", "||", "`", "$(", ">", "<", "\n")
_DISALLOWED_ROOT_COMMANDS = frozenset(
    {"bash", "sh", "zsh", "csh", "ksh", "cmd.exe", "powershell", "pwsh", "sudo", "su"}
)


def validate_stdio_command(command: str | None, args: Sequence[str] | None = None) -> None:
    """校验本地 stdio 命令的安全合法性。

    1. 必须开启全局环境变量 ENABLE_LOCAL_MCP。
    2. command 不能为空，且不能为系统原生 Shell 或提权命令。
    3. 如果配置了 ALLOWED_LOCAL_COMMANDS 白名单，必须命中白名单。
    4. args 中禁止包含管道、多命令串联、变量替换等 Shell 注入符。
    """
    settings = get_settings()
    if not settings.enable_local_mcp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前系统运行环境未开启本地 (stdio) MCP 支持",
        )

    if not command or not command.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stdio 运行方式必须提供 command",
        )

    cmd_clean = command.strip()
    cmd_base = os.path.basename(cmd_clean).lower()

    if cmd_base in _DISALLOWED_ROOT_COMMANDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"安全限制：禁止直接使用 {cmd_base} 作为 MCP 启动命令",
        )

    if settings.allowed_local_commands:
        allowed = {item.lower().strip() for item in settings.allowed_local_commands}
        if cmd_base not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"安全限制：命令 {cmd_base} 不在系统允许的启动器名单内 ({settings.allowed_local_commands})",
            )

    for arg in args or []:
        if not isinstance(arg, str):
            continue
        for danger in _DANGEROUS_SHELL_INJECTIONS:
            if danger in arg:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"安全限制：参数中包含非法字符 '{danger}'",
                )

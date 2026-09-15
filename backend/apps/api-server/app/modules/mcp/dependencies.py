from app.modules.mcp.host import McpHost


# 内部持有 mcp_host 实例
_mcp_host: McpHost | None = None


def configure_mcp_host(host: McpHost | None) -> None:
    """配置当前进程运行时的 MCP Host。"""
    global _mcp_host
    _mcp_host = host


def get_mcp_host() -> McpHost | None:
    """获取当前配置的 MCP Host。"""
    return _mcp_host

#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "正在启动 Open Agent API Server (生产环境)..."
echo "=========================================="

# 执行数据库迁移
echo ">> 正在执行数据库迁移 (Alembic)..."
alembic -c alembic.ini upgrade head
echo ">> 数据库迁移完成！"

# 启动 uvicorn 生产服务
WORKERS="${OPEN_AGENT_WORKERS:-${LUI_AGENT_WORKERS:-2}}"
PORT="${PORT:-8000}"

echo ">> 正在启动 Uvicorn 服务 (端口: ${PORT}, Workers: ${WORKERS})..."
exec uvicorn app.main:app \
  --app-dir apps/api-server \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --workers "${WORKERS}" \
  --proxy-headers \
  --forwarded-allow-ips='*'

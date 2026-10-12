# 生产级 Python 3.14 + uv 镜像
FROM ghcr.io/astral-sh/uv:latest AS uv-binary
FROM python:3.14-slim AS runner

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PORT=10000 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 替换为国内镜像源，避免 deb.debian.org 官方源连接超时
# 同时使用 --fix-missing 提升网络容错
RUN (sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
     sed -i 's|http://deb.debian.org|http://mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true) && \
    apt-get update && apt-get install -y --no-install-recommends --fix-missing \
    ca-certificates \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# 从官方 uv 镜像复制 uv 二进制
COPY --from=uv-binary /uv /uvx /bin/

# 拷贝依赖清单（利用 Docker 缓存加速构建）
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/apps/api-server/pyproject.toml ./apps/api-server/
COPY backend/packages/lui-agent-runtime/pyproject.toml ./packages/lui-agent-runtime/

# 预安装项目第三方依赖（配置默认 PyPI 镜像源以防超时，针对 workspace 安装所有包）
RUN uv sync --frozen --no-install-project --no-dev --all-packages --default-index https://mirrors.aliyun.com/pypi/simple/ || \
    uv sync --frozen --no-install-project --no-dev --all-packages

# 拷贝后端应用代码与迁移脚本
COPY backend/alembic.ini ./
COPY backend/apps/api-server ./apps/api-server
COPY backend/packages/lui-agent-runtime ./packages/lui-agent-runtime

# 安装项目自身代码
RUN uv sync --frozen --no-dev --all-packages

# 准备启动脚本
COPY backend/scripts/start-prod.sh ./scripts/start-prod.sh
RUN chmod +x ./scripts/start-prod.sh

EXPOSE 10000

# 使用 Python 内置 urllib 进行健康检查，零外部依赖
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:10000/health')" || exit 1

ENTRYPOINT ["./scripts/start-prod.sh"]

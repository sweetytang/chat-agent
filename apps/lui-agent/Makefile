BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: help install db-up db-down backend frontend dev test test-backend test-frontend build build-backend build-frontend

help:
	@awk 'BEGIN {FS = ":.*## "; printf "可用任务:\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-16s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## 安装前后端依赖
	$(MAKE) -j2 install-frontend install-backend

install-frontend: ## 安装前端依赖
	cd $(FRONTEND_DIR) && pnpm install

install-backend: ## 安装后端依赖
	cd $(BACKEND_DIR) && uv sync

db-up: ## 启动 PostgreSQL
	docker compose up -d

db-down: ## 停止 PostgreSQL
	docker compose stop

dev: db-up ## 启动数据库，并行启动后端和前端
	$(MAKE) -j2 dev-backend dev-frontend

dev-backend: ## 启动 FastAPI 后端
	cd $(BACKEND_DIR) && uv run uvicorn app.main:app --port 8000 --reload

dev-frontend: ## 启动 Vite 前端
	cd $(FRONTEND_DIR) && pnpm dev

test: test-backend test-frontend ## 运行全部测试

test-backend: ## 运行后端测试
	cd $(BACKEND_DIR) && uv run pytest -q

test-frontend: ## 运行前端测试
	cd $(FRONTEND_DIR) && pnpm test

build: ## 构建前后端
	$(MAKE) -j2 build-backend build-frontend

build-backend: ## 检查后端代码可编译
	cd $(BACKEND_DIR) && uv run python -m compileall -q app

build-frontend: ## 构建前端生产包
	cd $(FRONTEND_DIR) && pnpm build

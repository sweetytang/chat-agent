# 你是全栈架构和工程化专家，开始优化当前项目。严格要求:

## 1. 分析代码的功能，按照功能放置到对应的文件夹下，如果文件夹不存在，则创建。其中项目基本目录如下：
    * frontend: 前端项目参考如下
        * app: 整体功能、框架入口
        * store: 全局状态
        * components: 组件
        * constants: 常量
        * hooks: 钩子
        * services: 服务
        * styles: 样式
        * types: 类型
        * public: 项目公共资源
        * utils: 工具
        * tests: 项目测试
        * pages: 页面
        * scripts: 项目脚本
        * pack: 打包构建
            * vite.config.ts: vite配置文件
            * webpack.config.js: webpack配置文件
    
    * backend: 后端python项目目录参考如下
        fastapi-project/
        ├── app/
        │   ├── main.py
        │   │
        │   ├── api/
        │   │   ├── router.py
        │   │   └── dependencies.py
        │   │
        │   ├── core/
        │   │   ├── config.py
        │   │   ├── security.py
        │   │   ├── exceptions.py
        │   │   ├── exception_handlers.py
        │   │   ├── logging.py
        │   │   └── middleware.py
        │   │
        │   ├── db/
        │   │   ├── base.py
        │   │   ├── session.py
        │   │   └── transaction.py
        │   │
        │   ├── modules/
        │   │   ├── users/
        │   │   │   ├── router.py
        │   │   │   ├── schemas.py
        │   │   │   ├── models.py
        │   │   │   ├── service.py
        │   │   │   ├── repository.py
        │   │   │   ├── dependencies.py
        │   │   │   ├── exceptions.py
        │   │   │   └── constants.py
        │   │   │
        │   │   ├── auth/
        │   │   │   ├── router.py
        │   │   │   ├── schemas.py
        │   │   │   ├── service.py
        │   │   │   ├── dependencies.py
        │   │   │   └── exceptions.py
        │   │   │
        │   │   └── conversations/
        │   │       ├── router.py
        │   │       ├── schemas.py
        │   │       ├── models.py
        │   │       ├── service.py
        │   │       ├── repository.py
        │   │       └── dependencies.py
        │   │
        │   ├── integrations/
        │   │   ├── redis/
        │   │   │   └── client.py
        │   │   ├── llm/
        │   │   │   ├── client.py
        │   │   │   └── providers/
        │   │   ├── storage/
        │   │   │   └── s3.py
        │   │   └── messaging/
        │   │       └── rabbitmq.py
        │   │
        │   ├── common/
        │   │   ├── enums.py
        │   │   ├── pagination.py
        │   │   ├── responses.py
        │   │   ├── types.py
        │   │   └── utils.py
        │   │
        │   └── workers/
        │       ├── celery_app.py
        │       └── tasks/
        │           └── conversation_tasks.py
        │
        ├── tests/
        │   ├── conftest.py
        │   ├── unit/
        │   │   ├── users/
        │   │   └── auth/
        │   ├── integration/
        │   │   ├── users/
        │   │   └── conversations/
        │   └── e2e/
        │
        ├── migrations/
        │   ├── versions/
        │   ├── env.py
        │   └── script.py.mako
        │
        ├── scripts/
        │   ├── create_admin.py
        │   └── seed_data.py
        │
        ├── docs/
        │   └── architecture.md
        │
        ├── .env
        ├── .env.example
        ├── alembic.ini
        ├── pyproject.toml
        ├── Dockerfile
        ├── docker-compose.yml
        ├── Makefile
        └── README.md

## 2. 项目架构：
    * 前端:
        * 组件库：react、react-dom
        * 样式：sass、css modules
        * 状态管理：useState + zustand。单一的内部状态用useState，多处复用的状态量统一到src/store
        * 打包构建：vite
        * 类型：typescript
        * 大模型：langchain、langgraph、langsmith
    * 后端:
        * 包管理：uv
        * 数据库：postgresql
        * 服务器: fastapi
        * 大模型：langchain、langgraph、langsmith
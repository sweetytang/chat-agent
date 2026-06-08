你是全栈架构和工程化专家，开始优化当前项目。
严格要求：
1.分析代码的功能，按照功能放置到对应的文件夹下，如果文件夹不存在，则创建。其中项目基本目录如下：
    * frontend: 前端项目源码
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
    
    * backend: 后端项目源码
        * config: 配置
        * controllers: 控制器
        * middlewares: 中间件
        * models: 大模型
        * routes: 路由
        * services: 服务
        * utils: 工具
        * tests: 项目测试
        * scripts: 项目脚本
        * app.js: 应用
        * server.js: 服务器
    * common: 前后端共用到的
        * utils
        * constants
        * types
    * dist: 项目构建产物
    * node_modules: 项目依赖
    * tsconfig.json: ts配置文件
    * package.json: 项目配置文件
    * pnpm-lock.yaml: 项目配置文件
    * README.md: 项目说明文件
    * docs: 项目文档

2.项目架构：
    * 前端:
        * 组件库：react、react-dom
        * 样式：sass、css modules
        * 状态管理：useState + zustand。单一的内部状态用useState，多处复用的状态量统一到src/store
        * 打包构建：vite
        * 类型：typescript
        * 大模型：langchain、langgraph、langsmith
    * 后端:
        * 数据库：sqlite、postgresql
        * ORM：prisma
        * 服务器: express
        * 大模型：langchain、langgraph、langsmith

3.前端代码文件内引用模块顺序：
    * 1.node_modules模块
    * 2.项目外部模块
    * 3.项目内部模块
        * 1.全局状态类
        * 2.方法类
        * 3.常量
        * 4.类型
        * 5.样式

4.前端组件应该和样式放在一起（除了全局样式），组件文件夹里包含对应组件index.tsx和对应样式index.module.scss。
4.代码结构清晰，易于维护，注释清晰，易于理解。难以理解的代码，添加注释，解释代码的功能。

5.对于行数大于500行的单文件，遵循单一职责原则和可读性，尝试进行拆分

6.项目文档、项目测试定期维护，确保其与代码同步。

7.最重要的一点：时刻保证项目的正常运行，重构前后表现一致



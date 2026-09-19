# Open Agent Web

Open Agent 的前端客户端与本地启动工具。

## 快速使用

无需克隆代码仓库，只需确保已安装 Node.js (>= 18)，在本地终端运行：

### 1. 临时运行（开箱即用，默认连接生产服务）

```bash
npx open-agent-web
```

若需连接自定义服务端地址：
```bash
npx open-agent-web --api https://agent.tenasourcing.com
```

### 2. 全局安装运行

```bash
npm install -g open-agent-web

# 启动并自动在浏览器中打开页面（默认连接 https://agent.tenasourcing.com）
open-agent
```

## 参数说明

| 参数 | 缩写 | 默认值 | 说明 |
|---|---|---|---|
| `--api <url>` | `-a` | `https://agent.tenasourcing.com` | 云端后端服务的访问地址 |
| `--port <port>` | `-p` | `8001` | 本地前端服务端口（若占用自动顺延） |
| `--host <host>` | `-H` | `127.0.0.1` | 本地服务监听地址 |
| `--no-open` | - | `false` | 启动后不自动唤起默认浏览器 |
| `--help` | `-h` | - | 显示帮助信息 |

也可以通过环境变量指定后端地址：

```bash
export OPEN_AGENT_API_URL=https://agent.tenasourcing.com
open-agent
```

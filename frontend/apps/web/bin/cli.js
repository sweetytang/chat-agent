#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 静态文件目录
const DIST_DIR = path.resolve(__dirname, '../dist');

// MIME 类型字典
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// 命令行参数解析
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    apiUrl:
      process.env.OPEN_AGENT_API_URL ||
      process.env.LUI_API_URL ||
      'https://agent.tenasourcing.com',
    port: parseInt(process.env.PORT || '8001', 10),
    host: process.env.HOST || '127.0.0.1',
    open: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`
Open Agent - 本地启动工具

用法:
  open-agent [选项]
  npx open-agent [选项]

选项:
  -a, --api <url>     云端后端服务地址 (默认: https://agent.tenasourcing.com，或读取环境变量 OPEN_AGENT_API_URL)
  -p, --port <port>   本地服务端口 (默认: 8001，若被占用自动顺延)
  -H, --host <host>   本地绑定主机 (默认: 127.0.0.1)
  --no-open           启动后不自动打开浏览器
  -h, --help          查看帮助信息

示例:
  npx open-agent
  npx open-agent --api https://agent.tenasourcing.com
`);
      process.exit(0);
    } else if (arg === '--api' || arg === '-a') {
      options.apiUrl = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '--host' || arg === '-H') {
      options.host = args[++i];
    } else if (arg === '--no-open') {
      options.open = false;
    }
  }

  // 规范化后端 API 地址
  options.apiUrl = options.apiUrl.replace(/\/+$/, '');
  return options;
}

// 检查端口是否被占用，若占用则递增
function findAvailablePort(startPort, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1, host));
    });
    server.listen({ port: startPort, host }, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}

// 自动打开浏览器
function openBrowser(url) {
  const platform = process.platform;
  let command = '';
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  exec(command, (err) => {
    if (err) {
      // 打开失败不影响服务运行
    }
  });
}

async function main() {
  const options = parseArgs();

  if (!fs.existsSync(DIST_DIR)) {
    console.error(`\x1b[31m错误: 未找到前端静态资源目录: ${DIST_DIR}\x1b[0m`);
    console.error(`请先执行构建: pnpm build`);
    process.exit(1);
  }

  const port = await findAvailablePort(options.port, options.host);
  const targetBackend = new URL(options.apiUrl);

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    // 1. API 反向代理 (/api/*)
    if (pathname.startsWith('/api')) {
      const isHttps = targetBackend.protocol === 'https:';
      const client = isHttps ? https : http;

      // 组装目标路径：如果配置的 apiUrl 自身包含路径则拼接
      const targetPath = targetBackend.pathname.replace(/\/+$/, '') + pathname + reqUrl.search;

      const proxyHeaders = { ...req.headers };
      proxyHeaders.host = targetBackend.host;
      if (proxyHeaders['x-forwarded-for']) {
        proxyHeaders['x-forwarded-for'] = `${proxyHeaders['x-forwarded-for']}, ${req.socket.remoteAddress}`;
      } else {
        proxyHeaders['x-forwarded-for'] = req.socket.remoteAddress;
      }
      proxyHeaders['x-forwarded-proto'] = 'http';
      proxyHeaders['x-forwarded-host'] = req.headers.host;

      const proxyReq = client.request(
        {
          protocol: targetBackend.protocol,
          hostname: targetBackend.hostname,
          port: targetBackend.port || (isHttps ? 443 : 80),
          method: req.method,
          path: targetPath,
          headers: proxyHeaders,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on('error', (err) => {
        console.error(`\x1b[31m[代理错误]\x1b[0m 无法连接后端 ${options.apiUrl}: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              error: 'Bad Gateway',
              message: `无法连接云端后端服务: ${options.apiUrl}`,
            }),
          );
        }
      });

      req.pipe(proxyReq);
      return;
    }

    // 2. 静态资源与 SPA 路由托管
    let filePath = path.join(DIST_DIR, pathname);
    let stat = null;
    try {
      if (fs.existsSync(filePath)) {
        stat = fs.statSync(filePath);
      }
    } catch {}

    // 如果不是文件（或者是目录），返回 index.html
    if (!stat || !stat.isFile()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 如果是 index.html，动态注入运行时配置
    if (filePath.endsWith('index.html')) {
      fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('读取 index.html 失败');
          return;
        }

        // 注入全局配置：默认使用本地代理 /api
        const configScript = `
  <script>
    window.__OPEN_AGENT_CONFIG__ = {
      apiRoot: '/api',
      targetBackend: ${JSON.stringify(options.apiUrl)}
    };
    window.__LUI_CONFIG__ = window.__OPEN_AGENT_CONFIG__;
  </script>
</head>`;
        const modifiedHtml = html.replace('</head>', configScript);

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(modifiedHtml);
      });
      return;
    }

    // 静态资源文件响应
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('文件未找到');
      }
    });
  });

  server.listen(port, options.host, () => {
    const localUrl = `http://${options.host === '0.0.0.0' ? 'localhost' : options.host}:${port}`;
    console.log(`
\x1b[32m✔ Open Agent Web 前端已启动！\x1b[0m
--------------------------------------------------
  ➜ 本地访问地址: \x1b[36m${localUrl}/\x1b[0m
  ➜ 后端服务代理: \x1b[33m${options.apiUrl}\x1b[0m
--------------------------------------------------
\x1b[90m按 Ctrl+C 退出服务\x1b[0m
`);

    if (options.open) {
      openBrowser(localUrl);
    }
  });

  const shutdown = () => {
    console.log('\n正在停止服务...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('\x1b[31m启动异常:\x1b[0m', err);
  process.exit(1);
});

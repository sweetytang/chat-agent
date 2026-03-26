# Prisma 快速上手教程

## 1. 安装与初始化

```bash
# 安装依赖
pnpm add prisma @prisma/client
# 或 npm install prisma @prisma/client

# 初始化（默认使用 SQLite，适合本地开发）
npx prisma init --datasource-provider sqlite
```

这会生成：
```
prisma/
  schema.prisma    ← 数据模型定义
.env               ← 数据库连接字符串
```

> [!TIP]
> 支持的数据库：`sqlite`、`postgresql`、`mysql`、`mongodb`、`sqlserver`、`cockroachdb`

---

## 2. 定义 Schema

编辑 `prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")   // .env 中定义
}

// ── 用户表 ──
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String?                         // ? 表示可选字段
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt             // 自动更新时间戳

  posts     Post[]                          // 一对多关系
  profile   Profile?                        // 一对一关系
}

// ── 文章表 ──
model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  published Boolean  @default(false)
  createdAt DateTime @default(now())

  author    User     @relation(fields: [authorId], references: [id])
  authorId  String                          // 外键

  tags      Tag[]                           // 多对多关系（隐式）
}

// ── 个人资料表（一对一）──
model Profile {
  id     String  @id @default(uuid())
  bio    String?
  avatar String?

  user   User    @relation(fields: [userId], references: [id])
  userId String  @unique                    // @unique 保证一对一
}

// ── 标签表（多对多）──
model Tag {
  id    String @id @default(uuid())
  name  String @unique
  posts Post[]                              // 隐式多对多，Prisma 自动建中间表
}
```

### 常用字段修饰符速查

| 修饰符 | 作用 | 示例 |
|---|---|---|
| `@id` | 主键 | `id String @id` |
| `@default(uuid())` | 默认值为 UUID | |
| `@default(autoincrement())` | 自增整数 | `id Int @id @default(autoincrement())` |
| `@default(now())` | 默认当前时间 | |
| `@unique` | 唯一约束 | `email String @unique` |
| `@updatedAt` | 自动更新时间 | |
| `?` | 可选字段 | `name String?` |
| `@relation` | 定义关联 | |
| `@@unique([a, b])` | 联合唯一 | `@@unique([email, name])` |
| `@@index([field])` | 索引 | `@@index([createdAt])` |
| `@@map("table_name")` | 映射数据库表名 | |

---

## 3. 迁移数据库

```bash
# 创建迁移并应用（开发环境）
npx prisma migrate dev --name init

# 重置数据库（⚠️ 会清空数据）
npx prisma migrate reset

# 生产环境部署迁移
npx prisma migrate deploy
```

> [!NOTE]
> `migrate dev` 会自动：
> 1. 对比 schema 变更，生成 SQL 迁移文件
> 2. 执行迁移
> 3. 重新生成 Prisma Client

---

## 4. 使用 Prisma Client（CRUD）

### 4.1 初始化 Client

```ts
// lib/prisma.ts — 推荐单例模式
import { PrismaClient } from '@prisma/client';

// 防止开发环境热重载创建多个实例
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
```

### 4.2 创建（Create）

```ts
import { prisma } from './lib/prisma';

// 创建单条
const user = await prisma.user.create({
    data: {
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed_password',
    },
});

// 创建并包含关联数据（嵌套创建）
const userWithPost = await prisma.user.create({
    data: {
        email: 'bob@example.com',
        name: 'Bob',
        password: 'hashed_password',
        posts: {
            create: [
                { title: '第一篇文章', content: 'Hello World' },
                { title: '第二篇文章', content: 'Prisma is great' },
            ],
        },
        profile: {
            create: { bio: '全栈开发者' },
        },
    },
    include: {         // 返回结果中包含关联数据
        posts: true,
        profile: true,
    },
});

// 批量创建
const users = await prisma.user.createMany({
    data: [
        { email: 'a@test.com', name: 'A', password: '123' },
        { email: 'b@test.com', name: 'B', password: '456' },
    ],
    skipDuplicates: true,   // 跳过已存在的（根据唯一字段）
});
```

### 4.3 查询（Read）

```ts
// 查单条（唯一字段）
const user = await prisma.user.findUnique({
    where: { email: 'alice@example.com' },
});

// 查单条（任意条件，返回第一个匹配）
const firstPublished = await prisma.post.findFirst({
    where: { published: true },
});

// 查多条
const allUsers = await prisma.user.findMany();

// 条件查询 + 排序 + 分页
const posts = await prisma.post.findMany({
    where: {
        published: true,
        title: { contains: 'Prisma' },       // 模糊匹配
        createdAt: { gte: new Date('2024-01-01') },  // 大于等于
    },
    orderBy: { createdAt: 'desc' },
    skip: 0,     // 偏移量（分页）
    take: 10,    // 每页数量
});

// 关联查询（include 加载关联）
const userWithPosts = await prisma.user.findUnique({
    where: { id: 'xxx' },
    include: {
        posts: {
            where: { published: true },      // 可以过滤关联
            orderBy: { createdAt: 'desc' },
            take: 5,
        },
        profile: true,
    },
});

// 只返回部分字段（select）
const userNames = await prisma.user.findMany({
    select: {
        id: true,
        name: true,
        _count: { select: { posts: true } }, // 统计关联数量
    },
});

// 计数
const count = await prisma.post.count({
    where: { published: true },
});
```

### 常用 where 筛选条件

```ts
where: {
    name: 'Alice',                      // 精确匹配
    name: { not: 'Bob' },              // 不等于
    name: { in: ['Alice', 'Bob'] },    // IN
    name: { contains: 'li' },          // LIKE '%li%'
    name: { startsWith: 'A' },         // LIKE 'A%'
    age: { gt: 18 },                   // >
    age: { gte: 18 },                  // >=
    age: { lt: 30 },                   // <
    age: { lte: 30 },                  // <=
    AND: [{ ... }, { ... }],           // AND
    OR: [{ ... }, { ... }],            // OR
    NOT: { ... },                      // NOT
}
```

### 4.4 更新（Update）

```ts
// 更新单条
const updated = await prisma.user.update({
    where: { email: 'alice@example.com' },
    data: { name: 'Alice Updated' },
});

// 更新或创建（Upsert）
const user = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: { name: 'Alice' },          // 存在则更新
    create: {                           // 不存在则创建
        email: 'alice@example.com',
        name: 'Alice',
        password: 'hashed',
    },
});

// 批量更新
await prisma.post.updateMany({
    where: { authorId: 'xxx' },
    data: { published: true },
});

// 数值字段的原子操作
await prisma.post.update({
    where: { id: 'xxx' },
    data: {
        viewCount: { increment: 1 },   // 还有 decrement, multiply, divide
    },
});
```

### 4.5 删除（Delete）

```ts
// 删除单条
await prisma.user.delete({
    where: { id: 'xxx' },
});

// 批量删除
await prisma.post.deleteMany({
    where: { published: false },
});

// 删除所有
await prisma.post.deleteMany();
```

---

## 5. 事务

```ts
// 方式一：自动事务（推荐）
const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
        data: { email: 'new@test.com', name: 'New', password: '123' },
    });

    const post = await tx.post.create({
        data: { title: 'Hello', authorId: user.id },
    });

    return { user, post };
    // 如果任何操作失败，整个事务自动回滚
});

// 方式二：批量操作事务
const [deletedPosts, deletedUser] = await prisma.$transaction([
    prisma.post.deleteMany({ where: { authorId: 'xxx' } }),
    prisma.user.delete({ where: { id: 'xxx' } }),
]);
```

---

## 6. 常用 CLI 命令

| 命令 | 作用 |
|---|---|
| `npx prisma init` | 初始化项目 |
| `npx prisma migrate dev --name xxx` | 创建并应用迁移（开发） |
| `npx prisma migrate deploy` | 应用迁移（生产） |
| `npx prisma migrate reset` | 重置数据库 |
| `npx prisma generate` | 重新生成 Client（改了 schema 后） |
| `npx prisma db push` | 直接同步 schema 到数据库（不建迁移文件，适合原型阶段） |
| `npx prisma db pull` | 从现有数据库反向生成 schema |
| `npx prisma studio` | 打开可视化数据库管理界面 |
| `npx prisma format` | 格式化 schema 文件 |
| `npx prisma validate` | 验证 schema 语法 |

> [!TIP]
> `npx prisma studio` 会启动一个浏览器 GUI，可以直观地查看和编辑数据，非常适合调试。

---

## 7. 在 Express 中使用的完整示例

```ts
import express from 'express';
import { prisma } from './lib/prisma';

const app = express();
app.use(express.json());

// 注册
app.post('/api/register', async (req, res) => {
    const { email, name, password } = req.body;
    try {
        const user = await prisma.user.create({
            data: { email, name, password },
            select: { id: true, email: true, name: true },
        });
        res.json(user);
    } catch (e: any) {
        if (e.code === 'P2002') {
            // 唯一约束冲突
            res.status(409).json({ error: '邮箱已存在' });
        } else {
            res.status(500).json({ error: e.message });
        }
    }
});

// 获取用户及其文章
app.get('/api/users/:id', async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: {
            posts: { orderBy: { createdAt: 'desc' } },
            profile: true,
        },
    });
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
});

// 优雅关闭
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

app.listen(3000);
```

---

## 8. 常见错误码

| 错误码 | 含义 |
|---|---|
| `P2002` | 唯一约束冲突（重复数据） |
| `P2003` | 外键约束失败 |
| `P2025` | 记录不存在（update/delete 找不到目标） |
| `P2014` | 关系违规 |

捕获方式：
```ts
import { Prisma } from '@prisma/client';

try {
    await prisma.user.create({ data: { ... } });
} catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
            console.log('重复的字段:', e.meta?.target);
        }
    }
}
```

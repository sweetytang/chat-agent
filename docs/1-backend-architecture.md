# Backend Architecture

## Goal

The `human-in-the-loop` backend is now organized under `src/backend` so that Express bootstrapping, controllers, persistence, authentication, and LangChain orchestration each live in a predictable place.

## Backend Layout

```text
src/backend
├── config
│   └── env.ts
├── controllers
│   ├── authController.ts
│   ├── runController.ts
│   └── threadController.ts
├── middlewares
│   ├── auth.ts
│   └── requestLogger.ts
├── models
│   ├── interruptRepository.ts
│   ├── legacyThreads.ts
│   ├── prisma.ts
│   ├── threadMapper.ts
│   └── threadRepository.ts
├── routes
│   ├── authRoutes.ts
│   └── threadRoutes.ts
├── services
│   ├── ai
│   │   ├── agent.ts
│   │   ├── model.ts
│   │   └── tools
│   ├── authService.ts
│   └── chat
│       ├── messageSerde.ts
│       ├── messageState.ts
│       ├── modelRunService.ts
│       ├── streamModelCall.ts
│       └── threadTitle.ts
├── utils
│   └── sse.ts
├── app.ts
└── server.ts
```

## Responsibilities

- `config`: environment and runtime configuration helpers.
- `controllers`: Express request handlers for auth, thread state, and HITL run streaming.
- `middlewares`: request logger and auth guards.
- `models`: Prisma client plus repository-style persistence code.
- `routes`: route registration and URL wiring.
- `services`: business logic, LangChain model orchestration, tool execution, and message state helpers.
- `utils`: backend-only utility helpers such as SSE event writers.
- `app.ts` / `server.ts`: app assembly and server bootstrap entrypoint.

## Runtime Entry

- Server bootstrap: `src/backend/server.ts`
- Express app factory: `src/backend/app.ts`
- Prisma schema/config: `prisma/schema.prisma` and `prisma.config.ts`
- Dev server script: `pnpm --dir apps/human-in-the-loop run dev:server`

## Refactor Notes

- Thread data and interrupts still use the same SQLite database file and Prisma schema as before.
- HITL behavior is preserved: new message, interrupt, approve/reject/edit, tool execution, and stream continuation all follow the previous flow.
- Browser-only auth storage helpers remain in `src/utils/authClient.ts` so the browser layer stays separate from `src/backend`.

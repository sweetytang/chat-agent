-- CreateTable
CREATE TABLE "users" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "sessions" (
    "token" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "threads" (
    "thread_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    "metadata_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "values_json" TEXT NOT NULL,
    "latest_checkpoint_id" TEXT,
    CONSTRAINT "threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "thread_checkpoints" (
    "checkpoint_id" TEXT NOT NULL PRIMARY KEY,
    "thread_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata_json" TEXT NOT NULL,
    "values_json" TEXT NOT NULL,
    CONSTRAINT "thread_checkpoints_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads" ("thread_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "interrupts" (
    "thread_id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "checkpoint_id" TEXT,
    "hitl_request_json" TEXT NOT NULL,
    "ai_message_json" TEXT NOT NULL,
    "all_messages_json" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL,
    CONSTRAINT "interrupts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads" ("thread_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_sessions_expires_at" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_threads_user_id_updated_at" ON "threads"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "idx_thread_checkpoints_thread_created_at" ON "thread_checkpoints"("thread_id", "created_at");

/**
 * uuid.ts — UUID 生成工具
 */
import crypto from "crypto";

/** 生成一个随机 UUID */
export function uuid(): string {
    return crypto.randomUUID();
}

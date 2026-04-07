import crypto from "crypto";

export function uuid(): string {
    return crypto.randomUUID();
}

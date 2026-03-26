import crypto from "crypto";
import { prisma } from '@/config/prisma';
import { IUser } from "../../../types";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** --------------- 内部调用utils ---------------- */
function hashPassword(password: string) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password: string, passwordHash: string) {
    const [salt, storedHash] = passwordHash.split(":");
    if (!salt || !storedHash) {
        return false;
    }

    const derivedHash = crypto.scryptSync(password, salt, 64);
    const storedBuffer = Buffer.from(storedHash, "hex");
    return storedBuffer.length === derivedHash.length && crypto.timingSafeEqual(storedBuffer, derivedHash);
}

function toUser(row: { userId: string; username: string; createdAt: Date }): IUser {
    return {
        user_id: row.userId,
        username: row.username,
        created_at: row.createdAt,
    };
}

function getExpiresAt() {
    const now = new Date();
    return new Date(now.getTime() + SESSION_TTL_MS).toISOString();
}

async function createSession(userId: string) {
    const expiresAt = getExpiresAt();

    const { token } = await prisma.session.create({
        data: {
            userId,
            expiresAt,
        },
    });

    return {
        token,
        expires_at: expiresAt,
    };
}




/** ------------------ services ------------------ */
export async function registerUser(username: string, password: string) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
        throw new Error("Username is required");
    }
    if (password.length < 6) {
        throw new Error("Password must be at least 6 characters");
    }

    const [userCount, existingUser] = await Promise.all([
        prisma.user.count(),
        prisma.user.findUnique({ where: { username: normalizedUsername } }),
    ]);

    if (existingUser) {
        throw new Error("Username already exists");
    }

    const { userId, sessions } = await prisma.user.create({
        data: {
            username: normalizedUsername,
            passwordHash: hashPassword(password),
            sessions: {
                create: {
                    expiresAt: getExpiresAt()
                }
            }
        },
        include: {
            sessions: true
        }
    });

    if (userCount === 0) {
        // 为了处理一个典型的业务场景：用户先体验，后注册
        await prisma.thread.updateMany({
            where: {
                OR: [{ userId: null }, { userId: "" }],
            },
            data: { userId },
        });
    }

    return {
        user: {
            user_id: userId,
            username: normalizedUsername
        },
        session: sessions[0],
    };
}


export async function loginUser(username: string, password: string) {
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
        throw new Error("Username and password are required");
    }

    const user = await prisma.user.findUnique({
        where: { username: normalizedUsername },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
        throw new Error("Invalid username or password");
    }

    return {
        user: toUser(user),
        session: await createSession(user.userId),
    };
}


export async function getUserByToken(token: string) {
    const session = await prisma.session.findUnique({
        where: { token },
    });

    if (!session) {
        return null;
    }

    if (session.expiresAt <= new Date()) {
        await prisma.session.deleteMany({
            where: { token },
        });
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { userId: session.userId },
    });

    return user ? toUser(user) : null;
}

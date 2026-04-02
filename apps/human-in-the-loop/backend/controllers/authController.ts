import { Request, Response } from "express";
import { prisma } from '@/config/prisma';
import { requireAuthenticatedUser } from "../middlewares/auth.js";
import { loginUser, registerUser } from "../services/auth";

export async function register(req: Request, res: Response) {
    try {
        const { username = "", password = "" } = req.body || {};
        res.status(201).json(await registerUser(username, password));
    } catch (error: any) {
        res.status(400).json({ error: error.message, message: error.message });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { username = "", password = "" } = req.body || {};
        res.json(await loginUser(username, password));
    } catch (error: any) {
        res.status(401).json({ error: error.message, message: error.message });
    }
}

export async function getCurrentUser(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (user) {
        res.json({ user });
    }
}

export async function logout(req: Request, res: Response) {
    const user = await requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    await prisma.session.deleteMany({
        where: { userId: user.user_id },
    });

    res.json({ success: true });
}

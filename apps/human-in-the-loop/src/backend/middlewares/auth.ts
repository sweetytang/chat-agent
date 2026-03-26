import { Request, Response } from "express";
import { getUserByToken } from "../services/auth";
import { IUser } from "../../types";

function getBearerToken(req: Request) {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
        return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
}

export async function requireAuthenticatedUser(req: Request, res: Response): Promise<IUser | null> {
    const token = getBearerToken(req);
    if (!token) {
        res.status(401).json({ error: "Unauthorized", message: "Missing bearer token" });
        return null;
    }

    const user = await getUserByToken(token);
    if (!user) {
        res.status(401).json({ error: "Unauthorized", message: "Invalid or expired session" });
        return null;
    }

    return user;
}

import { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
}

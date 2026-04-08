import express, { Express } from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/authRoutes.js";
import { threadRouter } from "./routes/threadRoutes.js";
import { requestLogger } from "./middlewares/requestLogger.js";

export function createBackendApp(): Express {
    const app = express();
    const distDir = path.resolve(import.meta.dirname, "../dist");
    const indexHtmlPath = path.join(distDir, "index.html");

    app.use(cors());
    app.use(express.json());
    app.use(requestLogger);
    app.use("/auth", authRouter);
    app.use(threadRouter);
    app.use(express.static(distDir));
    app.get("/", (_req, res) => {
        res.sendFile(indexHtmlPath);
    });

    return app;
}

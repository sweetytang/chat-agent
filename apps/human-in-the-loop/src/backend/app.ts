import express, { Express } from "express";
import cors from "cors";
import { authRouter } from "./routes/authRoutes.js";
import { threadRouter } from "./routes/threadRoutes.js";
import { requestLogger } from "./middlewares/requestLogger.js";

export function createBackendApp(): Express {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(requestLogger);
    app.use("/auth", authRouter);
    app.use(threadRouter);

    return app;
}

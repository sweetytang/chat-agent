import { Router } from "express";
import { getCurrentUser, login, logout, register } from "../controllers/authController.js";

export const authRouter: Router = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", getCurrentUser);
authRouter.post("/logout", logout);

import { Router } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { projectsRouter } from "./projects";
import { tasksRouter } from "./tasks";
import usersRouter from "./users";

const router = Router();

// healthRouter defines its own "/healthz" route, so mount it at "/" here —
// mounting it at "/healthz" too would make the real path "/healthz/healthz".
router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/projects", projectsRouter);
router.use("/tasks", tasksRouter);
router.use("/users", usersRouter);

export default router;

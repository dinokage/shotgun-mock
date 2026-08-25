import { Router } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { projectsRouter } from "./projects";
import { tasksRouter } from "./tasks";

const router = Router();

router.use("/auth", authRouter);
router.use("/healthz", healthRouter);
router.use("/projects", projectsRouter);
router.use("/tasks", tasksRouter);

export default router;

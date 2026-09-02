import { Router } from "express";
import healthRouter from "./health";
import { authRouter } from "./auth";
import { clientAccessRouter } from "./client-access";
import { projectsRouter } from "./projects";
import { tasksRouter } from "./tasks";
import usersRouter from "./users";
import departmentsRouter from "./departments";
import rolesRouter from "./roles";
import { episodesRouter } from "./episodes";
import { sequencesRouter } from "./sequences";
import { shotsRouter } from "./shots";
import { assetsRouter } from "./assets";
import { versionsRouter } from "./versions";
import { reviewsRouter } from "./reviews";
import { dailyLogsRouter } from "./daily-logs";
import { invitesRouter } from "./invites";

const router = Router();

// healthRouter defines its own "/healthz" route, so mount it at "/" here —
// mounting it at "/healthz" too would make the real path "/healthz/healthz".
router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/client-access", clientAccessRouter);
router.use("/projects", projectsRouter);
router.use("/tasks", tasksRouter);
router.use("/users", usersRouter);
router.use("/departments", departmentsRouter);
router.use("/roles", rolesRouter);
router.use("/episodes", episodesRouter);
router.use("/sequences", sequencesRouter);
router.use("/shots", shotsRouter);
router.use("/assets", assetsRouter);
router.use("/versions", versionsRouter);
router.use("/reviews", reviewsRouter);
router.use("/daily-logs", dailyLogsRouter);
router.use("/invites", invitesRouter);

export default router;

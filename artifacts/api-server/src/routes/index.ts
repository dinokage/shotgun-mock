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
import { reviewSessionRouter } from "./review-session";
import { dailyLogsRouter } from "./daily-logs";
import { attendanceRouter } from "./attendance";
import { invitesRouter } from "./invites";
import { uploadsRouter } from "./uploads";
import { auditLogsRouter } from "./audit-logs";
import { auditRollbacksRouter } from "./audit-rollbacks";
import { assetActivityRouter } from "./asset-activity";
import { notificationsRouter } from "./notifications";
import { standupUpdatesRouter } from "./standup-updates";
import {
  standupPlaylistRouter,
  standupApprovalsRouter,
} from "./standup-board";
import { broadcastsRouter } from "./broadcasts";
import { pipelineTemplatesRouter, projectPipelinesRouter } from "./pipelines";
import {
  trackingViewsRouter,
  notificationPreferencesRouter,
} from "./user-preferences";
import { chatRouter } from "./chat";
import { deliveriesRouter } from "./deliveries";
import { publishingRouter } from "./publishing";
import { schemaBuilderRouter } from "./schema-builder";
import { workflowsRouter } from "./workflows";
import { pluginsRouter } from "./plugins";
import {
  studioSettingsRouter,
  apiKeysRouter,
  webhooksRouter,
  licenseServersRouter,
  integrationsRouter,
} from "./studio-settings";

const router = Router();

// healthRouter defines its own "/healthz" route, so mount it at "/" here —
// mounting it at "/healthz" too would make the real path "/healthz/healthz".
router.use("/", healthRouter);
router.use("/auth", authRouter);
router.use("/client-access", clientAccessRouter);
router.use("/projects", projectsRouter);
// Second router on the same mount point: projectsRouter's own routes are all
// one segment deep ("/", "/:id"), so "/projects/:projectId/pipeline" falls
// through to here rather than being swallowed by "/:id".
router.use("/projects", projectPipelinesRouter);
router.use("/pipeline-templates", pipelineTemplatesRouter);
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
router.use("/review-session", reviewSessionRouter);
router.use("/daily-logs", dailyLogsRouter);
router.use("/attendance", attendanceRouter);
router.use("/invites", invitesRouter);
router.use("/uploads", uploadsRouter);
router.use("/audit-logs", auditLogsRouter);
router.use("/audit-rollbacks", auditRollbacksRouter);
router.use("/asset-activity", assetActivityRouter);
router.use("/notifications", notificationsRouter);
router.use("/notification-preferences", notificationPreferencesRouter);
router.use("/tracking-views", trackingViewsRouter);
router.use("/standup-updates", standupUpdatesRouter);
router.use("/standup-playlist", standupPlaylistRouter);
router.use("/standup-approvals", standupApprovalsRouter);
router.use("/broadcasts", broadcastsRouter);
router.use("/chat", chatRouter);
router.use("/deliveries", deliveriesRouter);
router.use("/publish-logs", publishingRouter);
router.use("/schema", schemaBuilderRouter);
router.use("/workflows", workflowsRouter);
router.use("/plugins", pluginsRouter);
router.use("/studio-settings", studioSettingsRouter);
router.use("/api-keys", apiKeysRouter);
router.use("/webhooks", webhooksRouter);
router.use("/license-servers", licenseServersRouter);
router.use("/integrations", integrationsRouter);

export default router;

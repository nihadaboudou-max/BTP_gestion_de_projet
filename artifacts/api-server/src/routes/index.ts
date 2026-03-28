import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import projectsRouter from "./projects.js";
import tasksRouter from "./tasks.js";
import pointageRouter from "./pointage.js";
import personnelRouter from "./personnel.js";
import expensesRouter from "./expenses.js";
import messagesRouter from "./messages.js";
import notificationsRouter from "./notifications.js";
import activityRouter from "./activity.js";
import reclamationsRouter from "./reclamations.js";
import presenceConfirmationsRouter from "./presenceConfirmations.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/projects", projectsRouter);
router.use("/tasks", tasksRouter);
router.use("/pointage", pointageRouter);
router.use("/personnel", personnelRouter);
router.use("/expenses", expensesRouter);
router.use("/messages", messagesRouter);
router.use("/notifications", notificationsRouter);
router.use("/activity", activityRouter);
router.use("/dashboard", activityRouter);
router.use("/reclamations", reclamationsRouter);
router.use("/presence-confirmations", presenceConfirmationsRouter);

export default router;

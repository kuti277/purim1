import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
 * Health-check endpoint — confirms the Functions runtime is alive.
 * GET /healthCheck → { status: "ok", timestamp: "<ISO string>" }
 *
 * TODO: replace with actual business-logic functions in Phase 2.
 */
export const healthCheck = onRequest((req, res) => {
  logger.info("healthCheck called", { method: req.method });
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

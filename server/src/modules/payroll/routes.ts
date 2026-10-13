import { Router } from "express";
import { z } from "zod";
import { PayrollRun, PayrollItem } from "../../infrastructure/models.js";
import { handler, ok } from "../../common/http.js";
import { requirePermission } from "../roles/policy.js";
import { AppError, deny } from "../../common/errors.js";
import { id } from "../employees/validators.js";
import { PayrollService } from "./service.js";
export function payrollRoutes(service: PayrollService) {
  const router = Router();
  router.get(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, "payroll.read");
      if (req.actor.scope !== "company") throw deny();
      ok(
        res,
        await PayrollRun.find({ companyId: req.actor.companyId })
          .populate("periodId", "name startDate endDate payDate")
          .sort({ createdAt: -1 })
          .limit(100),
      );
    }),
  );
  router.post(
    "/",
    handler(async (req, res) => {
      const data = z.object({ periodId: id }).strict().parse(req.body);
      const key = z.string().min(16).max(100).parse(req.get("idempotency-key"));
      ok(
        res.status(201),
        await service.create(req.actor, data.periodId, key, req.correlationId),
      );
    }),
  );
  router.get(
    "/:id",
    handler(async (req, res) => {
      requirePermission(req.actor, "payroll.read");
      if (req.actor.scope !== "company") throw deny();
      const run = await PayrollRun.findOne({
        _id: id.parse(req.params.id),
        companyId: req.actor.companyId,
      }).populate("periodId");
      if (!run) throw new AppError(404, "NOT_FOUND", "Record not found");
      ok(res, {
        run,
        items: await PayrollItem.find({
          runId: run.id,
          companyId: req.actor.companyId,
        }),
      });
    }),
  );
  router.post(
    "/:id/calculate",
    handler(async (req, res) =>
      ok(
        res,
        await service.compute(
          req.actor,
          id.parse(req.params.id),
          z
            .object({ revision: z.number().int().min(0) })
            .strict()
            .parse(req.body).revision,
          req.correlationId,
        ),
      ),
    ),
  );
  router.post(
    "/:id/transition",
    handler(async (req, res) => {
      const data = z
        .object({
          status: z.enum(["Under Review", "Approved", "Rejected", "Finalized"]),
          revision: z.number().int().min(0),
          reason: z.string().min(3).max(500),
        })
        .strict()
        .parse(req.body);
      ok(
        res,
        await service.transition(
          req.actor,
          id.parse(req.params.id),
          data.status,
          data.revision,
          data.reason,
          req.correlationId,
        ),
      );
    }),
  );
  return router;
}

import { Router } from "express";
import PDFDocument from "pdfkit";
import {
  Payslip,
  PayrollItem,
  PayrollRun,
  Company,
  User,
} from "../../infrastructure/models.js";
import { handler, ok } from "../../common/http.js";
import { requirePermission } from "../roles/policy.js";
import { scopedEmployeeIds } from "../attendance/routes.js";
import { id } from "../employees/validators.js";
import { AppError, deny } from "../../common/errors.js";
import { audit, notify } from "../../infrastructure/audit.js";
const amount = (value: string) => {
  const n = BigInt(value),
    abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}PHP ${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
};
export function payslipRoutes() {
  const router = Router();
  router.get(
    "/",
    handler(async (req, res) => {
      requirePermission(req.actor, "payslips.read");
      ok(
        res,
        await Payslip.find({
          companyId: req.actor.companyId,
          employeeId: { $in: await scopedEmployeeIds(req.actor) },
          ...(req.actor.scope === "self"
            ? { releasedAt: { $exists: true } }
            : {}),
        })
          .populate("runId", "runNumber periodSnapshot")
          .sort({ createdAt: -1 })
          .limit(100),
      );
    }),
  );
  router.post(
    "/:id/release",
    handler(async (req, res) => {
      requirePermission(req.actor, "payslips.release");
      if (req.actor.scope !== "company") throw deny();
      const payslip = await Payslip.findOneAndUpdate(
        {
          _id: id.parse(req.params.id),
          companyId: req.actor.companyId,
          releasedAt: { $exists: false },
        },
        { $set: { releasedAt: new Date(), releasedBy: req.actor.userId } },
        { new: true },
      );
      if (!payslip)
        throw new AppError(404, "NOT_FOUND", "Unreleased payslip not found");
      await audit(req.actor, "payslip.release", payslip.id, req.correlationId);
      const user = await User.findOne({
        companyId: req.actor.companyId,
        employeeId: payslip.employeeId,
      });
      if (user)
        await notify(
          req.actor.companyId,
          user.id,
          "Your payslip is available",
          "/payslips",
        );
      ok(res, payslip);
    }),
  );
  router.get(
    "/:id/pdf",
    handler(async (req, res) => {
      requirePermission(req.actor, "payslips.read");
      const payslip = await Payslip.findOne({
        _id: id.parse(req.params.id),
        companyId: req.actor.companyId,
        employeeId: { $in: await scopedEmployeeIds(req.actor) },
        ...(req.actor.scope === "self"
          ? { releasedAt: { $exists: true } }
          : {}),
      });
      if (!payslip) throw new AppError(404, "NOT_FOUND", "Record not found");
      const item = await PayrollItem.findById(payslip.itemId),
        run = await PayrollRun.findById(payslip.runId),
        company = await Company.findById(req.actor.companyId);
      if (!item || !run || !["Finalized", "Paid"].includes(run.status))
        throw new AppError(409, "NOT_FINALIZED", "Payslip unavailable");
      await audit(req.actor, "payslip.download", payslip.id, req.correlationId);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GinhawaHR-${payslip.id}.pdf"`,
        "Cache-Control": "no-store",
      });
      const pdf = new PDFDocument({ size: "A4", margin: 48 });
      pdf.pipe(res);
      pdf.fillColor("#123C35").fontSize(26).text("GinhawaHR");
      pdf.fontSize(10).text("People First. Payroll Made Easy.");
      pdf
        .moveDown(2)
        .fontSize(16)
        .text(company?.name ?? "Employer");
      pdf.fontSize(10).text(company?.address ?? "");
      pdf
        .moveDown()
        .text(
          `Employee: ${item.snapshot.employee.firstName} ${item.snapshot.employee.lastName}`,
        )
        .text(`Employee ID: ${item.snapshot.employee.employeeNumber}`)
        .text(
          `Period: ${run.periodSnapshot.startDate} to ${run.periodSnapshot.endDate}`,
        )
        .text(`Run: ${run.runNumber}`);
      pdf.moveDown();
      for (const [name, value] of [
        ["Base pay", item.result.base],
        ["Gross earnings", item.result.gross],
        ["Other deductions", item.result.deductions],
        ["Employee contributions", item.result.contributions],
        ["Withholding tax", item.result.tax],
        ["Net pay", item.result.net],
      ])
        pdf.text(`${name}: ${amount(value)}`);
      pdf.moveDown().text("Itemized earnings and deductions");
      for (const entry of [
        ...item.snapshot.input.earnings,
        ...item.snapshot.input.deductions,
      ] as { name: string; amount: string }[])
        pdf.text(`${entry.name}: ${amount(entry.amount)}`);
      for (const contribution of item.result.statutory as {
        kind: string;
        employee: string;
      }[])
        pdf.text(`${contribution.kind}: ${amount(contribution.employee)}`);
      pdf.end();
    }),
  );
  return router;
}

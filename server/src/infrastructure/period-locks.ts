import type { ClientSession } from "mongoose";
import { PayrollPeriod } from "./models.js";
import { AppError } from "../common/errors.js";
import type { PeriodLockPolicy } from "../common/ports.js";
export class MongoPeriodLockPolicy implements PeriodLockPolicy {
  async assertWritable(
    companyId: string,
    from: string,
    to: string,
    session?: ClientSession,
  ) {
    if (
      await PayrollPeriod.exists({
        companyId,
        status: "Locked",
        startDate: { $lte: to },
        endDate: { $gte: from },
      }).session(session ?? null)
    )
      throw new AppError(
        409,
        "PERIOD_LOCKED",
        "This period is locked. A traceable payroll correction is required.",
      );
  }
}

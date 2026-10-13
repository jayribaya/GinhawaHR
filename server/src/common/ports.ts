import type { ClientSession } from "mongoose";
// Modules depend on this explicit policy port, not another module's HTTP API.
export interface PeriodLockPolicy {
  assertWritable(
    companyId: string,
    from: string,
    to: string,
    session?: ClientSession,
  ): Promise<void>;
}

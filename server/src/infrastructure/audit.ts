import type { ClientSession } from "mongoose";
import { AuditLog, Notification } from "./models.js";
import type { Principal } from "../modules/roles/policy.js";
export async function audit(
  actor: Principal,
  action: string,
  subject: string,
  correlationId: string,
  reason?: string,
  session?: ClientSession,
) {
  await AuditLog.create(
    [
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        action,
        subject,
        correlationId,
        reason,
      },
    ],
    { session },
  );
}
export async function notify(
  companyId: string,
  userId: string,
  title: string,
  link: string,
  session?: ClientSession,
) {
  await Notification.create([{ companyId, userId, title, link }], { session });
}

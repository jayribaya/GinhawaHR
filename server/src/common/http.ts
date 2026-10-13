import type { Request, Response, NextFunction } from "express";
import type { Principal } from "../modules/roles/policy.js";
export interface ContextRequest extends Request {
  actor: Principal;
  correlationId: string;
}
export const handler =
  (fn: (req: ContextRequest, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as ContextRequest, res)).catch(next);
  };
export const ok = (res: Response, data: unknown, meta?: unknown) =>
  res.json({ data, ...(meta ? { meta } : {}) });

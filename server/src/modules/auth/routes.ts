import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Config } from "../../config/env.js";
import { handler, ok } from "../../common/http.js";
import { AuthService } from "./service.js";
import { Session, User } from "../../infrastructure/models.js";
import { hashToken } from "../../infrastructure/crypto.js";
import { audit } from "../../infrastructure/audit.js";
import { AppError } from "../../common/errors.js";
const password = z.string().min(12).max(128);
export function authRoutes(config: Config, auth: AuthService) {
  const router = Router();
  const limited = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const cookies = (
    res: import("express").Response,
    tokens: Awaited<ReturnType<AuthService["issue"]>>,
  ) => {
    res.cookie("gh_refresh", tokens.refresh, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/v1/auth",
      maxAge: 7 * 86400000,
    });
    res.cookie("gh_csrf", tokens.csrf, {
      httpOnly: false,
      secure: config.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400000,
    });
    return ok(res, { accessToken: tokens.accessToken });
  };
  const origin = (req: import("express").Request) => {
    if (req.get("origin") !== config.APP_ORIGIN)
      throw new AppError(403, "CSRF", "Invalid request origin");
  };
  router.post(
    "/login",
    limited,
    handler(async (req, res) => {
      const data = z
        .object({
          email: z.email().transform((v) => v.toLowerCase()),
          password: z.string().max(128),
          totp: z.string().optional(),
        })
        .parse(req.body);
      cookies(
        res,
        await auth.login(
          data.email,
          data.password,
          data.totp,
          req.correlationId,
        ),
      );
    }),
  );
  router.post(
    "/refresh",
    handler(async (req, res) => {
      origin(req);
      cookies(
        res,
        await auth.refresh(
          String(req.cookies.gh_refresh ?? ""),
          req.get("x-csrf-token") ?? "",
        ),
      );
    }),
  );
  router.post(
    "/logout",
    handler(async (req, res) => {
      origin(req);
      const entry = await Session.findOne({
        tokenHash: hashToken(String(req.cookies.gh_refresh ?? "")),
      });
      if (entry) {
        auth.checkCsrf(entry.csrfHash, req.get("x-csrf-token") ?? "");
        await Session.updateMany(
          { family: entry.family },
          { $set: { revokedAt: new Date() } },
        );
        await auth.securityEvent(
          String(entry.userId),
          "auth.logout",
          req.correlationId,
        );
      }
      res.clearCookie("gh_refresh", { path: "/api/v1/auth" });
      res.clearCookie("gh_csrf", { path: "/" });
      ok(res, { loggedOut: true });
    }),
  );
  router.post(
    "/forgot-password",
    limited,
    handler(async (req, res) => {
      const { email } = z.object({ email: z.email() }).parse(req.body);
      await auth.passwordToken(email, "reset");
      ok(res, {
        message:
          "If an account exists, a reset request has been recorded. Contact your administrator for delivery.",
      });
    }),
  );
  router.post(
    "/reset-password",
    limited,
    handler(async (req, res) => {
      const data = z
        .object({ token: z.string().min(20), password })
        .parse(req.body);
      await auth.reset(data.token, data.password);
      ok(res, { message: "Password updated. Sign in again." });
    }),
  );
  return router;
}
export function protectedAuthRoutes(auth: AuthService) {
  const router = Router();
  router.get(
    "/me",
    handler(async (req, res) => {
      const user = await User.findById(req.actor.userId).select("name email");
      ok(res, { ...req.actor, name: user?.name, email: user?.email });
    }),
  );
  router.get(
    "/sessions",
    handler(async (req, res) =>
      ok(
        res,
        await Session.find({
          userId: req.actor.userId,
          revokedAt: { $exists: false },
        }).select("_id createdAt lastUsedAt userAgent"),
      ),
    ),
  );
  router.delete(
    "/sessions/:id",
    handler(async (req, res) => {
      await Session.updateOne(
        {
          _id: z
            .string()
            .regex(/^[a-f\d]{24}$/i)
            .parse(req.params.id),
          userId: req.actor.userId,
        },
        { $set: { revokedAt: new Date() } },
      );
      await audit(
        req.actor,
        "auth.session.revoke",
        String(req.params.id),
        req.correlationId,
      );
      ok(res, { revoked: true });
    }),
  );
  router.post(
    "/change-password",
    handler(async (req, res) => {
      const data = z.object({ current: z.string(), password }).parse(req.body);
      await auth.changePassword(req.actor, data.current, data.password);
      await audit(
        req.actor,
        "auth.password.change",
        req.actor.userId,
        req.correlationId,
      );
      ok(res, { changed: true });
    }),
  );
  router.post(
    "/mfa/setup",
    handler(async (req, res) => {
      const { current } = z
        .object({ current: z.string().max(128) })
        .strict()
        .parse(req.body);
      ok(res, await auth.setupMfa(req.actor, current));
    }),
  );
  router.post(
    "/mfa/enable",
    handler(async (req, res) => {
      await auth.enableMfa(
        req.actor,
        z.object({ code: z.string().length(6) }).parse(req.body).code,
      );
      await audit(
        req.actor,
        "auth.mfa.enable",
        req.actor.userId,
        req.correlationId,
      );
      ok(res, { enabled: true });
    }),
  );
  return router;
}

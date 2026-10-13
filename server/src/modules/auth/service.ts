import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomUUID, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { authenticator } from "otplib";
import {
  User,
  Session,
  Role,
  AuthToken,
  AuditLog,
} from "../../infrastructure/models.js";
import {
  hashToken,
  newToken,
  encrypt,
  decrypt,
} from "../../infrastructure/crypto.js";
import { AppError } from "../../common/errors.js";
import type { Config } from "../../config/env.js";
import type { Principal } from "../roles/policy.js";
const invalid = () =>
  new AppError(
    401,
    "UNAUTHENTICATED",
    "Authentication required or credentials invalid.",
  );
export class AuthService {
  private dummyHash = argon2.hash(newToken(), { type: argon2.argon2id });
  constructor(private config: Config) {}
  async securityEvent(
    userId: string,
    action: string,
    correlationId: string = randomUUID(),
    session?: mongoose.ClientSession,
  ) {
    const user = await User.findById(userId).session(session ?? null);
    if (user)
      await AuditLog.create(
        [
          {
            companyId: user.companyId,
            actorId: userId,
            action,
            subject: userId,
            correlationId,
          },
        ],
        { session },
      );
  }
  async principal(userId: string): Promise<Principal> {
    const user = await User.findOne({ _id: userId, active: true });
    if (!user) throw invalid();
    const role = await Role.findOne({
      _id: user.roleId,
      companyId: user.companyId,
    });
    if (!role) throw invalid();
    return {
      userId: user.id,
      companyId: String(user.companyId),
      employeeId: user.employeeId ? String(user.employeeId) : undefined,
      departmentIds: user.departmentIds.map(String),
      permissions: role.permissions,
      scope: role.scope as Principal["scope"],
    };
  }
  async issue(
    userId: string,
    family: string = randomUUID(),
    transaction?: mongoose.ClientSession,
    expiresAt = new Date(Date.now() + 7 * 86400000),
  ) {
    const refresh = newToken(),
      csrf = newToken();
    const [session] = await Session.create(
      [
        {
          userId,
          tokenHash: hashToken(refresh),
          csrfHash: hashToken(csrf),
          family,
          expiresAt,
          lastUsedAt: new Date(),
        },
      ],
      { session: transaction },
    );
    return {
      refresh,
      csrf,
      accessToken: jwt.sign(
        { sub: userId, sid: session!.id },
        this.config.JWT_SECRET,
        { expiresIn: "10m", issuer: "GinhawaHR", audience: "GinhawaHR-client" },
      ),
    };
  }
  async login(
    email: string,
    password: string,
    totp?: string,
    correlationId?: string,
  ) {
    const user = await User.findOne({ email, active: true }).select(
      "+passwordHash +mfaSecret",
    );
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user?.passwordHash || !valid) {
      if (user)
        await this.securityEvent(user.id, "auth.login.failed", correlationId);
      throw invalid();
    }
    if (
      user.mfaEnabled &&
      (!totp ||
        !user.mfaSecret ||
        !authenticator.check(
          totp,
          decrypt(user.mfaSecret, this.config.FIELD_ENCRYPTION_KEY),
        ))
    )
      throw invalid();
    if (user.mfaEnabled) {
      const step = Math.floor(Date.now() / 30000);
      const consumed = await User.updateOne(
        { _id: user.id, mfaLastStep: { $ne: step } },
        { $set: { mfaLastStep: step } },
      );
      if (!consumed.modifiedCount) throw invalid();
    }
    const tokens = await this.issue(user.id);
    await this.securityEvent(user.id, "auth.login.success", correlationId);
    return tokens;
  }
  async refresh(token: string, csrf: string) {
    const session = await Session.findOne({ tokenHash: hashToken(token) });
    if (!session) throw invalid();
    this.checkCsrf(session.csrfHash, csrf);
    if (session.revokedAt) {
      await Session.updateMany(
        { family: session.family },
        { $set: { revokedAt: new Date() } },
      );
      await this.securityEvent(String(session.userId), "auth.refresh.reuse");
      throw invalid();
    }
    if (
      session.expiresAt.getTime() < Date.now() ||
      session.lastUsedAt.getTime() < Date.now() - 30 * 60000
    )
      throw invalid();
    await this.principal(String(session.userId));
    const rotated = await mongoose.connection.transaction(
      async (transaction) => {
        const consumed = await Session.findOneAndUpdate(
          { _id: session._id, revokedAt: { $exists: false } },
          { $set: { revokedAt: new Date() } },
          { session: transaction },
        );
        if (!consumed) {
          await Session.updateMany(
            { family: session.family },
            { $set: { revokedAt: new Date() } },
            { session: transaction },
          );
          await this.securityEvent(
            String(session.userId),
            "auth.refresh.reuse",
            undefined,
            transaction,
          );
          return null;
        }
        return this.issue(
          String(session.userId),
          session.family,
          transaction,
          session.expiresAt,
        );
      },
    );
    if (!rotated) throw invalid();
    return rotated;
  }
  checkCsrf(expected: string, provided: string) {
    const actual = hashToken(provided);
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual)))
      throw new AppError(403, "CSRF", "Invalid request origin or CSRF token");
  }
  async authenticate(token: string) {
    try {
      const payload = jwt.verify(token, this.config.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "GinhawaHR",
        audience: "GinhawaHR-client",
      }) as jwt.JwtPayload;
      const session = await Session.findOne({
        _id: payload.sid,
        userId: payload.sub,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
        lastUsedAt: { $gt: new Date(Date.now() - 30 * 60000) },
      });
      if (!session) throw invalid();
      await Session.updateOne(
        { _id: session.id },
        { $set: { lastUsedAt: new Date() } },
      );
      return this.principal(String(payload.sub));
    } catch {
      throw invalid();
    }
  }
  async passwordToken(email: string, purpose: "reset" | "invitation") {
    const user = await User.findOne({ email });
    if (!user) return undefined;
    const token = newToken();
    await AuthToken.create({
      userId: user.id,
      hash: hashToken(token),
      purpose,
      expiresAt: new Date(Date.now() + 3600000),
    });
    return token;
  }
  async reset(token: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await mongoose.connection.transaction(async (session) => {
      const entry = await AuthToken.findOneAndUpdate(
        {
          hash: hashToken(token),
          usedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        },
        { $set: { usedAt: new Date() } },
        { session },
      );
      if (!entry)
        throw new AppError(400, "INVALID_TOKEN", "Invalid or expired token");
      await User.updateOne(
        { _id: entry.userId },
        { $set: { passwordHash, mustChangePassword: false } },
        { session },
      );
      await Session.updateMany(
        { userId: entry.userId },
        { $set: { revokedAt: new Date() } },
        { session },
      );
    });
  }
  async changePassword(actor: Principal, current: string, password: string) {
    const user = await User.findById(actor.userId).select("+passwordHash");
    if (
      !user?.passwordHash ||
      !(await argon2.verify(user.passwordHash, current))
    )
      throw invalid();
    user.passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await user.save();
    await Session.updateMany(
      { userId: actor.userId },
      { $set: { revokedAt: new Date() } },
    );
  }
  async setupMfa(actor: Principal, current: string) {
    const user = await User.findById(actor.userId).select("+passwordHash");
    if (
      !user?.passwordHash ||
      !(await argon2.verify(user.passwordHash, current))
    )
      throw invalid();
    if (user?.mfaEnabled)
      throw new AppError(
        409,
        "MFA_ENABLED",
        "MFA is already enabled; administrator recovery is required to replace it",
      );
    const secret = authenticator.generateSecret();
    await User.updateOne(
      { _id: actor.userId },
      {
        $set: {
          mfaSecret: encrypt(secret, this.config.FIELD_ENCRYPTION_KEY),
          mfaEnabled: false,
        },
      },
    );
    return {
      secret,
      uri: authenticator.keyuri(actor.userId, "GinhawaHR", secret),
    };
  }
  async enableMfa(actor: Principal, code: string) {
    const user = await User.findById(actor.userId).select("+mfaSecret");
    if (
      !user?.mfaSecret ||
      !authenticator.check(
        code,
        decrypt(user.mfaSecret, this.config.FIELD_ENCRYPTION_KEY),
      )
    )
      throw invalid();
    await User.updateOne({ _id: actor.userId }, { $set: { mfaEnabled: true } });
  }
}

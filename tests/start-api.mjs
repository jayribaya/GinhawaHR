// Ephemeral fictional E2E backend. No production database or credentials are used.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
Object.assign(process.env, {
  NODE_ENV: "test",
  PORT: "4000",
  MONGODB_URI: replica.getUri(),
  APP_ORIGIN: "http://127.0.0.1:5173",
  JWT_SECRET: randomBytes(32).toString("hex"),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  SEED_EMAIL: "admin@example.test",
  SEED_PASSWORD: "E2E_Fictional_Only_123!",
});
await import("../server/dist/seed.js");
await mongoose.connect(replica.getUri());
const { createApp } = await import("../server/dist/app.js");
const { readConfig } = await import("../server/dist/config/env.js");
const server = createApp(readConfig()).listen(4000, "127.0.0.1", () =>
  console.log("Ephemeral test API ready on 4000"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      void mongoose
        .disconnect()
        .then(() => replica.stop())
        .then(() => process.exit(0));
    }),
  );

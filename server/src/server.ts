import mongoose from "mongoose";
import pino from "pino";
import { readConfig } from "./config/env.js";
import { createApp } from "./app.js";
import * as models from "./infrastructure/models.js";
const logger = pino(),
  config = readConfig();
await mongoose.connect(config.MONGODB_URI);
await Promise.all(Object.values(models).map((model) => model.init()));
const server = createApp(config).listen(config.PORT, () =>
  logger.info({ port: config.PORT }, "GinhawaHR listening"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => {
      void mongoose.disconnect().then(() => process.exit(0));
    });
  });

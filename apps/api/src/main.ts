import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import cookieParser from "cookie-parser";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const logger = new Logger("Bootstrap");

  app.set("trust proxy", 1);
  // Playwright's trace viewer ships as static files and registers its own service worker,
  // so it is mounted before the strict CSP below. It only reads traces this origin serves.
  const traceViewer = path.join(path.dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "lib", "vite", "traceViewer");
  if (fs.existsSync(traceViewer)) app.use("/trace-viewer", express.static(traceViewer, { maxAge: "1d" }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Monaco loads its workers from blob: URLs and injects styles at runtime.
          scriptSrc: ["'self'", "blob:"],
          workerSrc: ["'self'", "blob:"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          frameSrc: ["'self'"],
          objectSrc: ["'self'"],
          mediaSrc: ["'self'", "blob:"],
          // Self-hosted installs are often reached over plain HTTP on a LAN address.
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser("json", { limit: "10mb" });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  // In production the API also serves the built web app.
  const index = path.join(config.webDist, "index.html");
  if (fs.existsSync(index)) {
    app.use(express.static(config.webDist, { index: false, maxAge: "1y", immutable: true }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" || /^\/(api|ws|trace-viewer)(\/|$)/.test(req.path)) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(index);
    });
  } else if (config.isProd) {
    logger.warn(`No web build found at ${config.webDist}; only the API is served.`);
  }

  await app.listen(config.port, "0.0.0.0");
  logger.log(`ScriptBench API listening on http://localhost:${config.port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

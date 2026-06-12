import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import type { ApiError } from "@spool/shared";
import { PubMedClient } from "./pubmed/client.js";
import { UpstreamError } from "./pubmed/errors.js";
import { authorRoutes } from "./routes/authors.js";
import { publicationRoutes } from "./routes/publications.js";

interface BuildOptions {
  client?: PubMedClient;
  staticDir?: string;
}

export function buildApp(opts: BuildOptions = {}): FastifyInstance {
  const app = Fastify({ logger: true });
  const client = opts.client ?? new PubMedClient();

  // Production serves the SPA same-origin and dev goes through the Vite proxy,
  // so cross-origin access is only ever needed for ad-hoc local tooling.
  app.register(cors, { origin: process.env.NODE_ENV === "production" ? false : true });
  app.register(rateLimit, { global: false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof UpstreamError) {
      req.log.error(
        { upstreamStatus: err.upstreamStatus, operation: err.operation },
        "upstream NCBI failure",
      );
      const status = err.upstreamStatus === 429 ? 503 : 502;
      const body: ApiError = {
        error: "upstream_unavailable",
        message: "PubMed is temporarily unavailable",
      };
      return reply.code(status).send(body);
    }
    if (err.validation) {
      const body: ApiError = { error: "bad_request", message: err.message };
      return reply.code(400).send(body);
    }
    if (err.statusCode === 429) {
      const body: ApiError = { error: "rate_limited", message: "Too many requests" };
      return reply.code(429).send(body);
    }
    req.log.error(err);
    const body: ApiError = { error: "internal_error" };
    return reply.code(500).send(body);
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  // Routes register inside an async plugin scope so @fastify/rate-limit
  // is ready before their per-route config is read.
  app.register(async (instance) => {
    authorRoutes(instance, client);
    publicationRoutes(instance, client);
  });

  if (opts.staticDir) {
    app.register(fastifyStatic, { root: opts.staticDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        const body: ApiError = { error: "not_found" };
        return reply.code(404).send(body);
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

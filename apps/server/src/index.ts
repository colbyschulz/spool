import path from "path";
import { buildApp } from "./app.js";

// Local dev secrets (NCBI_API_KEY etc.). Production injects real env vars.
try {
  // ../../../ from apps/server/src resolves to <repo-root>/.env
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
} catch {
  // .env is optional
}

const port = Number(process.env.PORT ?? 5174);

// process.cwd() is /app in the Docker container, so apps/web/dist is always reachable.
const staticDir =
  process.env.NODE_ENV === "production"
    ? (process.env.STATIC_DIR ?? path.join(process.cwd(), "apps/web/dist"))
    : undefined;

const app = buildApp({ staticDir });

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

// Railway sends SIGTERM on every deploy — drain in-flight requests before exiting.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

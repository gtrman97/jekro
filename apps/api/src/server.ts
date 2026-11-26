import express from "express";
import { handleError, notFound } from "./middleware/errors.ts";
import { ticketRoutes } from "./routes/tickets.ts";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.enable("case sensitive routing");
  app.enable("strict routing");

  // The original endpoints matched exact request targets.
  app.use((request, response, next) => {
    if (request.originalUrl !== request.path) {
      notFound(request, response, next);
      return;
    }
    next();
  });

  // Express would otherwise handle HEAD through the GET route.
  app.head("/health", notFound);
  app.get("/health", (_request, response) => {
    // Liveness always returns 200, including for conditional requests.
    response.type("application/json").end(JSON.stringify({ status: "ok" }));
  });
  app.use(ticketRoutes);
  app.use(notFound);
  app.use(handleError);
  return app;
}

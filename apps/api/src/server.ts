import express from "express";
import { handleError, notFound } from "./middleware/errors.ts";
import { ticketRoutes } from "./routes/tickets.ts";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  const routes = express.Router();
  routes.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  routes.use(ticketRoutes);

  app.use(routes);
  app.use(notFound);
  app.use(handleError);
  return app;
}

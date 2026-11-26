import { json, Router } from "express";
import type { RequestHandler } from "express";
import { CreateTicketSchema } from "@jekro/shared";
import { ApiError } from "../middleware/errors.ts";

export const ticketRoutes = Router();

const requireJson: RequestHandler = (request, _response, next) => {
  if (!request.is("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json");
  }
  next();
};

const createTicket: RequestHandler<Record<string, never>, unknown, unknown> = (
  request,
) => {
  const ticket = CreateTicketSchema.safeParse(request.body);
  if (!ticket.success) {
    throw new ApiError(400, "Invalid ticket data");
  }

  // Ticket persistence belongs to a later milestone.
  throw new ApiError(501, "Ticket creation not implemented");
};

ticketRoutes.post("/tickets", requireJson, json({ strict: false, limit: "100kb" }), createTicket);

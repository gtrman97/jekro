import { raw, Router } from "express";
import type { RequestHandler } from "express";
import { CreateTicketSchema } from "@jekro/shared";
import { ApiError, notFound } from "../middleware/errors.ts";

export const ticketRoutes = Router({ caseSensitive: true, strict: true });

const createTicket: RequestHandler<Record<string, never>, unknown, unknown> = (
  request,
) => {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.isBuffer(request.body) ? request.body.toString("utf8") : "");
  } catch {
    throw new ApiError(400, "Invalid JSON request");
  }

  const ticket = CreateTicketSchema.safeParse(json);
  if (!ticket.success) {
    throw new ApiError(400, "Invalid ticket data");
  }

  // Ticket persistence belongs to a later milestone.
  throw new ApiError(501, "Ticket creation not implemented");
};

// Express routers otherwise synthesize an OPTIONS response for known paths.
ticketRoutes.options("/tickets", notFound);

// Preserve UTF-8 JSON parsing regardless of Content-Type, including the
// distinction between an empty body and a valid JSON value that fails Zod.
ticketRoutes.post("/tickets", raw({ type: () => true, inflate: false }), createTicket);

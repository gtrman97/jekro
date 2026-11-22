import { z } from "zod";

export const TicketStatusSchema = z.enum([
  "open",
  "in_progress",
  "in_review",
  "done",
]);

export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const CreateTicketSchema = z.object({
  title: z.string().trim().min(1),
});

export type CreateTicket = z.infer<typeof CreateTicketSchema>;
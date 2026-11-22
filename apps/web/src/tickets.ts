import type { CreateTicket } from "@jekro/shared";

export function buildCreateTicketRequest(
  title: string,
): CreateTicket {
  return {
    title,
  };
}
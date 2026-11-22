import { createServer } from "node:http";
import { CreateTicketSchema } from "@jekro/shared";

export function createAppServer() {
  return createServer(async (request, response) => {
    const sendJson = (status: number, data: unknown) => {
      response.writeHead(status, {
        "Content-Type": "application/json",
      });

      response.end(JSON.stringify(data));
    };

    if (request.url === "/health" && request.method === "GET") {
      sendJson(200, { status: "ok" });
      return;
    }

    if (request.url === "/tickets" && request.method === "POST") {
      let body = "";

      try {
        for await (const chunk of request) {
          body += chunk.toString();
        }

        const json: unknown = JSON.parse(body);
        const result = CreateTicketSchema.safeParse(json);

        if (!result.success) {
          sendJson(400, { error: "Invalid ticket data" });
          return;
        }

        // Ticket persistence belongs to a later milestone.
        sendJson(501, { error: "Ticket creation not implemented" });
      } catch {
        sendJson(400, { error: "Invalid JSON request" });
      }

      return;
    }

    sendJson(404, { error: "Not found" });
  });
}
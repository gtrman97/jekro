import { createServer } from "node:http";

const server = createServer((request, response) => {
  if (request.url === "/health" && request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "application/json",
    });

    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, {
    "Content-Type": "application/json",
  });

  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(3000, "127.0.0.1", () => {
  console.log("Jekro API listening at http://127.0.0.1:3000");
});
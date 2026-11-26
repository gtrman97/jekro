import type { ErrorRequestHandler, RequestHandler } from "express";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, "Not found"));
};

export const handleError: ErrorRequestHandler = (
  error: unknown, _request, response, next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({ error: error.message });
    return;
  }

  if (typeof error === "object" && error !== null && "type" in error) {
    switch (error.type) {
      case "entity.too.large":
        response.status(413).json({ error: "Request body too large" });
        return;
      case "encoding.unsupported":
      case "request.aborted":
      case "request.size.invalid":
        response.status(400).json({ error: "Invalid JSON request" });
        return;
    }
  }

  response.status(500).json({ error: "Internal server error" });
};

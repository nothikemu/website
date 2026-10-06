/**
 * Typed application errors. Services throw these; the API layer maps them to
 * HTTP responses. Anything else becomes a generic 500 with no internals leaked.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const BadRequest = (message = "Bad request", details?: unknown) => new AppError(400, "bad_request", message, details);
export const Unauthorized = (message = "Authentication required") => new AppError(401, "unauthorized", message);
export const Forbidden = (message = "You do not have permission to do that") => new AppError(403, "forbidden", message);
export const NotFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const Conflict = (message: string) => new AppError(409, "conflict", message);
export const PayloadTooLarge = (message: string) => new AppError(413, "payload_too_large", message);
export const UnsupportedMedia = (message: string) => new AppError(415, "unsupported_media_type", message);
export const Unprocessable = (message: string, details?: unknown) =>
  new AppError(422, "validation_failed", message, details);
export const TooManyRequests = (retryAfter: number) =>
  new AppError(429, "rate_limited", "Too many requests. Please slow down.", { retryAfter });
export const PlanLimit = (message: string) => new AppError(402, "plan_limit", message);

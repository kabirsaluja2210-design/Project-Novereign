import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InsufficientCreditsError,
} from "@/server/errors";

export { NotFoundError, InsufficientCreditsError };

/**
 * Maps known error types to sensible HTTP status codes with human-readable
 * messages. Anything unrecognized becomes a generic 500 - we never leak
 * internal error details (stack traces, provider secrets) to the client.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "validation_error", message: "Invalid request", details: error.flatten() },
      { status: 400 },
    );
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "unauthorized", message: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: "forbidden", message: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: "not_found", message: error.message }, { status: 404 });
  }
  if (error instanceof InsufficientCreditsError) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `You need ${error.required - error.available} additional credits.`,
        required: error.required,
        available: error.available,
      },
      { status: 402 },
    );
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled_api_error]", error);
  return NextResponse.json(
    { error: "internal_error", message: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

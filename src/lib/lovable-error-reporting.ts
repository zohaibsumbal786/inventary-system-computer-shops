/**
 * Error reporting utility for the TechStock app.
 * Reports errors from React error boundaries to the console (extend with
 * your own monitoring service, e.g. Sentry, as needed).
 */

type ErrorContext = Record<string, unknown>;

export function reportLovableError(error: unknown, context: ErrorContext = {}) {
  if (typeof window === "undefined") return;

  const message = error instanceof Error ? error.message : String(error);
  console.error("[TechStock Error Boundary]", message, {
    route: window.location.pathname,
    ...context,
  });
}

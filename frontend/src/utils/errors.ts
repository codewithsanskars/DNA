/** Pulls the backend's `{ error }` message out of an axios rejection, for a toast/inline message. */
export function errorMessage(err: unknown, fallback: string): string {
  const anyErr = err as { response?: { data?: { error?: string } } };
  return anyErr?.response?.data?.error || fallback;
}

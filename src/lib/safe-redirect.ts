/**
 * Where to send someone after they sign in. Only paths inside this app are honoured: an absolute address (or a
 * protocol-relative "//host" one) in the link would otherwise let a crafted login URL bounce people to another site.
 */
export function safeCallbackPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

import { API_URL } from "@/lib/api";

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  if (path.startsWith("//")) return path;

  const origin = API_URL.replace(/\/+$/, "");
  return path.startsWith("/") ? `${origin}${path}` : `${origin}/${path}`;
}

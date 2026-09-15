import type { OkxSettingsData } from "./OkxSettingsModal";

export async function saveOkxSettings(
  settings: OkxSettingsData,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher("/api/okx/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (response.ok) return;

  const body = await response.json().catch(() => null) as { error?: unknown } | null;
  throw new Error(typeof body?.error === "string" ? body.error : `Unable to save OKX settings (${response.status})`);
}

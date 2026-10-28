export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

export type Role = "user" | "assistant";
export type Message = { role: Role; content: string; error?: boolean };
export type Attachment = { doc_id: string; filename: string; pages: number };

async function errorText(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {}
  return `The server returned ${res.status}.`;
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function uploadPdf(file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new ApiError(await errorText(res), res.status);
  return res.json();
}

/** Streams the assistant reply, calling onToken with each new piece of text. */
export async function streamChat(
  messages: Message[],
  docId: string | null,
  onToken: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.filter((m) => !m.error && m.content.trim()).map(({ role, content }) => ({ role, content })),
      doc_id: docId,
    }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(await errorText(res), res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}

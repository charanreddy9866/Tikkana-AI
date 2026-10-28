"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";
import { ApiError, checkHealth, streamChat, uploadPdf, type Attachment, type Message } from "@/lib/api";

type ServerState = "waking" | "ready" | "offline";

const STORAGE_KEY = "tikkana:v1";

const STARTERS = [
  "Who was Tikkana, and why would an assistant be named after him?",
  "Explain retrieval-augmented generation in plain words.",
  "తెలుగులో వర్షం గురించి ఒక చిన్న కవిత రాయి",
];

function loadSaved(): { messages: Message[]; attachment: Attachment | null } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return { messages: saved?.messages ?? [], attachment: saved?.attachment ?? null };
  } catch {
    return { messages: [], attachment: null };
  }
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(() => loadSaved().messages);
  const [attachment, setAttachment] = useState<Attachment | null>(() => loadSaved().attachment);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [server, setServer] = useState<ServerState>("waking");

  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the conversation in this browser so a refresh doesn't lose it.
  useEffect(() => {
    if (streaming) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, attachment }));
    } catch {}
  }, [messages, attachment, streaming]);

  // Free hosting tiers sleep when idle; keep checking for up to a minute while it wakes.
  useEffect(() => {
    const ctrl = new AbortController();
    let tries = 0;
    const poll = async () => {
      const ok = await checkHealth(ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (ok) return setServer("ready");
      if (++tries >= 12) return setServer("offline");
      setTimeout(poll, 5000);
    };
    poll();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Grow the textarea with its content, up to a limit.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;

      const history: Message[] = [...messages, { role: "user", content }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setNotice(null);
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        await streamChat(
          history,
          attachment?.doc_id ?? null,
          (token) =>
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + token };
              return next;
            }),
          ctrl.signal,
        );
        setServer("ready");
      } catch (err) {
        if (ctrl.signal.aborted) return;
        let msg = "Couldn't reach the server. Check your connection and try again.";
        if (err instanceof ApiError) {
          msg = err.message;
          if (err.status === 404 && attachment) {
            msg = `${attachment.filename} is no longer on the server. Attach it again to keep asking about it.`;
            setAttachment(null);
          }
        }
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: msg, error: true };
          return next;
        });
      } finally {
        setStreaming(false);
        abortRef.current = null;
        textRef.current?.focus();
      }
    },
    [messages, attachment, streaming],
  );

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNotice(null);
    setUploading(file.name);
    try {
      const doc = await uploadPdf(file);
      setAttachment(doc);
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Upload failed. Check your connection and try again.");
    } finally {
      setUploading(null);
      textRef.current?.focus();
    }
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setAttachment(null);
    setNotice(null);
    setInput("");
    textRef.current?.focus();
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-2.5">
          <span className="font-display text-2xl leading-none text-ink">తిక్కన</span>
          <span className="text-[15px] font-semibold tracking-tight text-text">Tikkana AI</span>
        </div>
        <div className="flex items-center gap-3">
          <ServerBadge state={server} />
          <button
            onClick={newChat}
            disabled={empty && !attachment}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-40"
          >
            New chat
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[46rem] px-4 sm:px-6">
          {empty ? (
            <EmptyState hasDoc={!!attachment} onPick={send} />
          ) : (
            <ol className="space-y-7 py-8" aria-live="polite">
              {messages.map((m, i) => (
                <li key={i}>
                  <MessageView
                    message={m}
                    live={streaming && i === messages.length - 1}
                  />
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="px-4 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-[46rem]">
          {notice && (
            <p role="alert" className="mb-2 text-sm text-danger">
              {notice}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="rounded-2xl border border-line bg-surface p-2 shadow-[0_1px_0_var(--line)] focus-within:border-turmeric"
          >
            {(attachment || uploading) && (
              <div className="px-2 pt-1 pb-2">
                <AttachmentChip
                  name={uploading ?? attachment!.filename}
                  detail={uploading ? "Reading…" : `${attachment!.pages} ${attachment!.pages === 1 ? "page" : "pages"}`}
                  onRemove={uploading ? undefined : () => setAttachment(null)}
                />
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!!uploading}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-40"
                aria-label="Attach a PDF"
                title="Attach a PDF"
              >
                <PaperclipIcon />
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
              <label htmlFor="prompt" className="sr-only">
                Message
              </label>
              <textarea
                id="prompt"
                ref={textRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={attachment ? `Ask about ${attachment.filename}` : "Ask Tikkana anything"}
                className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-1 py-2 focus-visible:outline-none text-[15px] leading-6 text-text outline-none placeholder:text-muted"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="h-10 shrink-0 rounded-xl border border-line px-4 text-sm font-semibold text-text hover:bg-page"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-10 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-page transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  Send
                </button>
              )}
            </div>
          </form>
          <p className="mt-2 text-center text-xs text-muted">
            Answers can be wrong. Check anything important. PDFs are kept in memory only, not stored.
          </p>
        </div>
      </footer>
    </div>
  );
}

function EmptyState({ hasDoc, onPick }: { hasDoc: boolean; onPick: (text: string) => void }) {
  return (
    <section className="flex min-h-full flex-col justify-center py-14 sm:py-20">
      <p aria-hidden className="glyph-in font-display text-[7.5rem] leading-[0.9] text-ink sm:text-[10rem]">
        తి
      </p>
      <h1 className="mt-6 max-w-[30ch] text-[1.75rem] leading-tight font-semibold tracking-tight text-text sm:text-[2rem]">
        {hasDoc ? "Your PDF is ready. Ask anything about it." : "Ask a question, or attach a PDF and ask about that."}
      </h1>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-muted">
        Named after Tikkana Somayaji, the 13th-century poet who brought the Mahabharata into Telugu. Replies in
        English or Telugu, and cites page numbers when answering from your document.
      </p>
      {!hasDoc && (
        <ul className="mt-9 divide-y divide-line border-y border-line">
          {STARTERS.map((s) => (
            <li key={s}>
              <button
                onClick={() => onPick(s)}
                className="group flex w-full items-center justify-between gap-4 py-3.5 text-left text-[15px] text-text transition-colors hover:text-ink"
              >
                <span className={/[ఀ-౿]/.test(s) ? "font-display text-[17px]" : ""}>{s}</span>
                <span aria-hidden className="text-turmeric opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Ask
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MessageView({ message, live }: { message: Message; live: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-user-bubble px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-user-text">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.error) {
    return (
      <p role="alert" className="border-l-2 border-danger pl-4 text-[15px] text-danger">
        {message.content}
      </p>
    );
  }
  if (live && !message.content) {
    return (
      <p className="caret font-display text-lg text-muted" aria-label="Thinking">
        ఆలోచిస్తున్నా
      </p>
    );
  }
  return (
    <div className={`border-l-2 border-turmeric pl-4 text-text ${live ? "live" : ""}`}>
      <Markdown>{message.content}</Markdown>
    </div>
  );
}

function AttachmentChip({ name, detail, onRemove }: { name: string; detail: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg bg-turmeric-soft py-1 pr-1.5 pl-2.5 text-sm text-text">
      <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden className="shrink-0 text-turmeric">
        <path d="M2 1h7l4 4v10H2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="truncate font-medium">{name}</span>
      <span className="shrink-0 text-muted">{detail}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-surface hover:text-text"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

function ServerBadge({ state }: { state: ServerState }) {
  const label = { waking: "Waking up the server", ready: "Online", offline: "Server unreachable" }[state];
  const dot = { waking: "bg-turmeric animate-pulse", ready: "bg-emerald-500", offline: "bg-danger" }[state];
  return (
    <span className="hidden items-center gap-2 text-xs text-muted sm:inline-flex" role="status">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function PaperclipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

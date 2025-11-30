"use client";

import { useState, useEffect, useRef } from "react";

export default function ChatPage() {
  const [messages, setMessages] = useState<{ sender: "user" | "bot"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Upload file
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessages((prev) => [...prev, { sender: "user", text: `📄 Uploaded: ${file.name}` }]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/upload/`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      setMessages((prev) => [...prev, { sender: "bot", text: data.content || "No text extracted." }]);
    } catch {
      setMessages((prev) => [...prev, { sender: "bot", text: "⚠️ File upload failed." }]);
    }
  }

  // Send chat message
  async function sendMessage() {
    if (!input.trim()) return;

    const msg = input;
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      const data = await res.json();
      setLoading(false);

      setMessages((prev) => [...prev, { sender: "bot", text: data.reply || "No response" }]);
    } catch {
      setLoading(false);
      setMessages((prev) => [...prev, { sender: "bot", text: "⚠️ Unable to reach server." }]);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-start p-6"
      style={liveBackground}
    >
      {/* TITLE */}
      <h1 className="mt-4 text-5xl font-extrabold text-black drop-shadow-xl tracking-wide">
        Tikkana ✨
      </h1>

      {/* CHAT BOX */}
      <div
        className="w-full max-w-3xl mt-10 rounded-3xl shadow-2xl backdrop-blur-2xl bg-white/20 border border-white/40 p-6 flex flex-col justify-between"
        style={{ height: "72vh" }}
      >

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex items-end ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.sender === "bot" && <div className="text-2xl mr-2">🤖</div>}
              {msg.sender === "user" && <div className="text-2xl mr-2">🧑‍💼</div>}
              <div
                className={`px-4 py-3 rounded-2xl max-w-[70%] text-lg shadow-xl backdrop-blur-2xl ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white/85 text-gray-900 border border-white/40"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* LOADING */}
          {loading && (
            <div className="flex items-end animate-pulse">
              <div className="text-2xl mr-2">🤖</div>
              <div className="px-4 py-3 rounded-2xl bg-white/60 text-gray-800 shadow-lg">
                Tikkana Alochisthunna…
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div className="w-full flex items-center gap-3 mt-4">

          {/* FILE BUTTON */}
          <label className="h-12 w-12 bg-white/50 flex items-center justify-center rounded-xl cursor-pointer backdrop-blur-xl hover:bg-white/70 transition shadow-xl border border-white/40">
            📎
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>

          {/* INPUT BAR */}
          <input
            type="text"
            className="flex-1 h-12 px-4 bg-white/50 backdrop-blur-xl border border-white/40 rounded-xl text-gray-900 shadow-lg outline-none"
            placeholder="Message Tikkana AI…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />

          {/* SEND BUTTON */}
          <button
            onClick={sendMessage}
            className="h-12 px-6 bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-xl shadow-xl font-semibold hover:opacity-90 transition"
          >
            Send
          </button>
        </div>
      </div>

      {/* FOOTER */}
      <p className="text-center text-black mt-4 text-sm font-semibold drop-shadow-lg">
        Tikkana  — Made by Charan 🐺✨
      </p>
    </div>
  );
}

/* 🌈 LIVE ANIMATED GRADIENT WALLPAPER */
const liveBackground: React.CSSProperties = {
  background: "linear-gradient(135deg, #a18cff, #6f9bff, #5ad0ff)",
  backgroundSize: "400% 400%",
  animation: "gradientMove 12s ease infinite",
};

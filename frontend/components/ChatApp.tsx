"use client";

import dynamic from "next/dynamic";

// The chat restores history from localStorage, so it renders in the browser only.
const Chat = dynamic(() => import("./Chat"), { ssr: false });

export default function ChatApp() {
  return <Chat />;
}

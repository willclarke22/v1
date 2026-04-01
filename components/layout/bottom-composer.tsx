"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

type BottomComposerProps = {
  onSendMessage: (message: string) => Promise<void> | void;
  isSending?: boolean;
};

export default function BottomComposer({
  onSendMessage,
  isSending = false,
}: BottomComposerProps) {
  const [message, setMessage] = useState("");

  const trimmedMessage = message.trim();
  const canSend = trimmedMessage.length > 0 && !isSending;

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();

    if (!canSend) return;

    const messageToSend = trimmedMessage;
    setMessage("");

    try {
      await onSendMessage(messageToSend);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessage(messageToSend);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-transparent">
      <div className="mx-auto flex w-full items-end gap-3">
        <div className="flex-1 rounded-[2rem] border border-white/6 bg-white/[0.026] px-5 py-4 shadow-[0_12px_36px_rgba(0,0,0,0.14)] backdrop-blur-md">
          <label htmlFor="message" className="sr-only">
            Send a message
          </label>

          <textarea
            id="message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask MyWay something..."
            disabled={isSending}
            className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-zinc-400/70 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <button
          type="submit"
          disabled={!canSend}
          className="rounded-2xl border border-white/10 bg-white/72 px-5 py-3 text-sm font-medium text-black shadow-[0_10px_24px_rgba(255,255,255,0.06)] transition hover:bg-white/88 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
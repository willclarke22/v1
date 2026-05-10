"use client";

import { FormEvent, KeyboardEvent, useEffect, useState } from "react";

type BottomComposerProps = {
  onSendMessage: (message: string) => Promise<void> | void;
  isSending?: boolean;
  onComposerTextStateChange?: (input: {
    composerHasText: boolean;
    lastActivityAt: string;
  }) => void;
};

export default function BottomComposer({
  onSendMessage,
  isSending = false,
  onComposerTextStateChange,
}: BottomComposerProps) {
  const [message, setMessage] = useState("");

  const trimmedMessage = message.trim();
  const canSend = trimmedMessage.length > 0 && !isSending;

  useEffect(() => {
    onComposerTextStateChange?.({
      composerHasText: trimmedMessage.length > 0,
      lastActivityAt: new Date().toISOString(),
    });
  }, [trimmedMessage.length, onComposerTextStateChange]);

  function updateMessage(nextMessage: string) {
    setMessage(nextMessage);

    onComposerTextStateChange?.({
      composerHasText: nextMessage.trim().length > 0,
      lastActivityAt: new Date().toISOString(),
    });
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();

    if (!canSend) return;

    const messageToSend = trimmedMessage;

    /**
     * Clear immediately so idle-state sees an empty composer while the message
     * is in flight. The parent page separately reports message_in_flight=true.
     */
    setMessage("");

    onComposerTextStateChange?.({
      composerHasText: false,
      lastActivityAt: new Date().toISOString(),
    });

    try {
      await onSendMessage(messageToSend);
    } catch (error) {
      console.error("Failed to send message:", error);

      /**
       * Restore the message if sending fails, and report that the composer is
       * non-empty again so enrichment workers can abort/avoid running.
       */
      setMessage(messageToSend);

      onComposerTextStateChange?.({
        composerHasText: true,
        lastActivityAt: new Date().toISOString(),
      });
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
            onChange={(e) => updateMessage(e.target.value)}
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
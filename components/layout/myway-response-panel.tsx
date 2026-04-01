"use client";

type MyWayResponsePanelProps = {
  reply: string;
  suggestedAction?: string;
  isSending?: boolean;
};

export default function MyWayResponsePanel({
  reply,
  suggestedAction,
  isSending = false,
}: MyWayResponsePanelProps) {
  const hasContent = isSending || reply || suggestedAction;

  if (!hasContent) return null;

  return (
    <div className="pointer-events-none w-full">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="pointer-events-auto rounded-3xl border border-white/10 bg-zinc-950/70 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="px-5 py-4 md:px-6 md:py-5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-400" />
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-400">
                MyWay
              </p>
            </div>

            <p className="mt-3 text-sm leading-7 text-zinc-100 md:text-[15px]">
              {isSending
                ? "MyWay is interpreting your message and deciding where to guide you next..."
                : reply}
            </p>

            {suggestedAction && !isSending && (
              <p className="mt-3 text-xs leading-6 text-zinc-400 md:text-sm">
                <span className="text-zinc-300">Next:</span> {suggestedAction}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
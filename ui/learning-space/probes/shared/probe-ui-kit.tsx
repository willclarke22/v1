"use client";

import type { CSSProperties, ReactNode } from "react";

export const probeTheme = {
  text: {
    primary: "rgba(255,255,255,0.96)",
    secondary: "rgba(244,244,245,0.78)",
    muted: "rgba(212,212,216,0.66)",
    faint: "rgba(212,212,216,0.48)",
  },
  border: {
    soft: "rgba(255,255,255,0.11)",
    medium: "rgba(255,255,255,0.16)",
    strong: "rgba(221,214,254,0.42)",
  },
  surface: {
    base: "linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.036))",
    elevated:
      "radial-gradient(circle at top left, rgba(221,214,254,0.12), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))",
    deep: "linear-gradient(145deg, rgba(10,10,24,0.72), rgba(39,13,64,0.46))",
    selected:
      "radial-gradient(circle at top left, rgba(221,214,254,0.22), transparent 35%), linear-gradient(145deg, rgba(124,58,237,0.34), rgba(255,255,255,0.08))",
  },
};

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function cleanProbeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function ProbeStack({
  children,
  gap = "1rem",
  style,
}: {
  children: ReactNode;
  gap?: CSSProperties["gap"];
  style?: CSSProperties;
}) {
  return <div style={{ display: "grid", gap, ...style }}>{children}</div>;
}

export function ProbeSection({
  children,
  title,
  subtitle,
  badge,
  tone = "default",
  style,
}: {
  children: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  tone?: "default" | "deep" | "selected" | "media" | "empty";
  style?: CSSProperties;
}) {
  const backgrounds = {
    default: probeTheme.surface.base,
    deep: probeTheme.surface.deep,
    selected: probeTheme.surface.selected,
    media:
      "radial-gradient(circle at center, rgba(168,85,247,0.13), rgba(0,0,0,0.22))",
    empty:
      "radial-gradient(circle at center, rgba(255,255,255,0.07), rgba(0,0,0,0.14))",
  };

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${probeTheme.border.soft}`,
        borderRadius: "28px",
        padding: "1rem",
        background: backgrounds[tone],
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055)",
        ...style,
      }}
    >
      {title || subtitle || badge ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.85rem",
            alignItems: "start",
            marginBottom: "0.85rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? (
              <p
                style={{
                  margin: 0,
                  color: probeTheme.text.primary,
                  fontSize: "0.98rem",
                  lineHeight: 1.35,
                  fontWeight: 900,
                }}
              >
                {title}
              </p>
            ) : null}
            {subtitle ? (
              <p
                style={{
                  margin: title ? "0.3rem 0 0" : 0,
                  color: probeTheme.text.secondary,
                  fontSize: "0.84rem",
                  lineHeight: 1.55,
                }}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {badge ? <div style={{ flexShrink: 0 }}>{badge}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ProbePill({
  children,
  active = false,
  tone = "default",
  style,
}: {
  children: ReactNode;
  active?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "purple";
  style?: CSSProperties;
}) {
  const toneStyle: Record<typeof tone, CSSProperties> = {
    default: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.065)",
      color: "rgba(255,255,255,0.78)",
    },
    success: {
      border: "1px solid rgba(187,247,208,0.24)",
      background: "rgba(34,197,94,0.09)",
      color: "rgba(220,252,231,0.9)",
    },
    warning: {
      border: "1px solid rgba(253,186,116,0.28)",
      background: "rgba(251,146,60,0.1)",
      color: "rgba(254,215,170,0.92)",
    },
    danger: {
      border: "1px solid rgba(254,202,202,0.24)",
      background: "rgba(244,63,94,0.12)",
      color: "rgba(254,226,226,0.92)",
    },
    purple: {
      border: "1px solid rgba(221,214,254,0.26)",
      background: active ? "rgba(221,214,254,0.18)" : "rgba(221,214,254,0.075)",
      color: "rgba(245,243,255,0.92)",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        borderRadius: "999px",
        padding: "0.34rem 0.58rem",
        fontSize: "0.72rem",
        lineHeight: 1,
        fontWeight: 850,
        whiteSpace: "nowrap",
        ...toneStyle[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function ProbeButton({
  children,
  disabled,
  onClick,
  type = "button",
  variant = "secondary",
  style,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
}) {
  const variants: Record<typeof variant, CSSProperties> = {
    primary: {
      border: "1px solid rgba(221,214,254,0.42)",
      background:
        "linear-gradient(135deg, rgba(255,255,255,0.18), rgba(168,85,247,0.24))",
      boxShadow: "0 16px 36px rgba(88,28,135,0.22)",
      color: "white",
    },
    secondary: {
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.075)",
      color: "rgba(255,255,255,0.88)",
    },
    ghost: {
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.035)",
      color: "rgba(255,255,255,0.75)",
    },
    danger: {
      border: "1px solid rgba(254,202,202,0.24)",
      background: "rgba(244,63,94,0.14)",
      color: "rgba(254,226,226,0.95)",
    },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        borderRadius: "999px",
        padding: "0.66rem 0.9rem",
        fontWeight: 850,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.48 : 1,
        transition:
          "background 140ms ease, border-color 140ms ease, opacity 140ms ease, transform 140ms ease",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function ProbeOptionCard({
  selected,
  disabled,
  label,
  children,
  input,
  onClick,
}: {
  selected?: boolean;
  disabled?: boolean;
  label?: ReactNode;
  children: ReactNode;
  input?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <label
      onClick={disabled ? undefined : onClick}
      style={{
        display: "grid",
        gridTemplateColumns: input ? "auto auto minmax(0,1fr)" : "auto minmax(0,1fr)",
        gap: "0.75rem",
        alignItems: "start",
        padding: "0.92rem",
        minHeight: "4.25rem",
        border: selected
          ? "1px solid rgba(221,214,254,0.62)"
          : "1px solid rgba(255,255,255,0.12)",
        borderRadius: "22px",
        background: selected ? probeTheme.surface.selected : "rgba(255,255,255,0.046)",
        boxShadow: selected
          ? "0 18px 42px rgba(76,29,149,0.24), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "inset 0 1px 0 rgba(255,255,255,0.035)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.58 : 1,
        transition:
          "border-color 140ms ease, background 140ms ease, box-shadow 140ms ease, transform 140ms ease",
      }}
    >
      {input}
      {label ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "2rem",
            height: "2rem",
            borderRadius: "999px",
            background: selected ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.78rem",
            fontWeight: 900,
          }}
        >
          {label}
        </span>
      ) : null}
      <span
        style={{
          display: "block",
          minWidth: 0,
          color: "rgba(255,255,255,0.94)",
          lineHeight: 1.5,
          fontSize: "0.94rem",
          fontWeight: 680,
          overflowWrap: "anywhere",
        }}
      >
        {children}
      </span>
    </label>
  );
}

export function ProbeTextArea({
  value,
  disabled,
  rows = 5,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: "100%",
        resize: "vertical",
        borderRadius: "22px",
        padding: "1rem",
        border: "1px solid rgba(255,255,255,0.14)",
        background:
          "linear-gradient(145deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
        color: "inherit",
        outline: "none",
        lineHeight: 1.62,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055)",
      }}
    />
  );
}

export function ProbeEmptyState({
  title,
  body,
}: {
  title: ReactNode;
  body?: ReactNode;
}) {
  return (
    <ProbeSection tone="empty" style={{ minHeight: "8rem", display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center", maxWidth: "32rem" }}>
        <p style={{ margin: 0, color: "white", fontWeight: 900 }}>{title}</p>
        {body ? (
          <p
            style={{
              margin: "0.35rem 0 0",
              color: probeTheme.text.secondary,
              fontSize: "0.86rem",
              lineHeight: 1.55,
            }}
          >
            {body}
          </p>
        ) : null}
      </div>
    </ProbeSection>
  );
}

export function ProbeProgressBar({
  value,
  label,
}: {
  value: number;
  label?: ReactNode;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div style={{ display: "grid", gap: "0.38rem" }}>
      {label ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            color: probeTheme.text.secondary,
            fontSize: "0.78rem",
            fontWeight: 800,
          }}
        >
          <span>{label}</span>
          <span>{safeValue}%</span>
        </div>
      ) : null}
      <div
        aria-hidden
        style={{
          overflow: "hidden",
          height: "0.52rem",
          borderRadius: "999px",
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            width: `${safeValue}%`,
            height: "100%",
            borderRadius: "999px",
            background: "linear-gradient(90deg, rgba(221,214,254,0.82), rgba(168,85,247,0.72))",
            boxShadow: "0 0 24px rgba(168,85,247,0.28)",
            transition: "width 180ms ease",
          }}
        />
      </div>
    </div>
  );
}

export function ProbeMediaFrame({
  children,
  missing,
  title = "Media placeholder",
  body = "The model did not supply a media URL yet.",
}: {
  children?: ReactNode;
  missing?: boolean;
  title?: ReactNode;
  body?: ReactNode;
}) {
  if (missing) {
    return <ProbeEmptyState title={title} body={body} />;
  }

  return (
    <ProbeSection tone="media" style={{ padding: "0.85rem" }}>
      <div
        style={{
          overflow: "hidden",
          borderRadius: "22px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(0,0,0,0.22)",
        }}
      >
        {children}
      </div>
    </ProbeSection>
  );
}

export function ProbeMiniLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        color: "rgba(255,255,255,0.76)",
        fontSize: "0.78rem",
        fontWeight: 850,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

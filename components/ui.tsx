"use client";

import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }
) {
  return (
    <input
      {...props}
      className={[
        "w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none bg-white",
        "focus:ring-2 focus:ring-slate-200",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { className?: string }
) {
  return (
    <textarea
      {...props}
      className={[
        "w-full border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none bg-white",
        "focus:ring-2 focus:ring-slate-200 min-h-[92px]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Btn({
  children,
  onClick,
  type = "button",
  variant = "primary",
  className = "",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed";

  const styles =
    variant === "primary"
      ? "bg-emerald-500 text-white hover:bg-emerald-600"
      : variant === "secondary"
      ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
      : variant === "danger"
      ? "bg-red-500 text-white hover:bg-red-600"
      : "bg-transparent text-slate-700 hover:bg-slate-100";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[base, styles, className].join(" ")}
    >
      {children}
    </button>
  );
}

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-100 rounded-xl p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold mt-1 text-slate-900">{value}</div>
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok";
}) {
  return (
    <span
      className={[
        "text-xs px-2 py-1 rounded-full",
        tone === "ok"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-600",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

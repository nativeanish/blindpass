import type { ReactNode } from "react";
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <svg
        width="30"
        height="30"
        viewBox="0 0 30 30"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M13 3H7a4 4 0 0 0-4 4v6m14 14h6a4 4 0 0 0 4-4v-6M3 18v5a4 4 0 0 0 4 4h5M18 3h5a4 4 0 0 1 4 4v5"
          stroke="currentColor"
          strokeWidth="2.5"
        />
        <path d="m10 18 8-8m-7 0h7v7" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      <span>
        BlindPass<span className="brand-period">.</span>
      </span>
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "neutral" | "red";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="tiny-square" />
      {children}
    </div>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as { message?: string; code?: string };
  return (
    <div className="notice error" role="alert">
      <strong>{e.code ?? "Something went wrong"}</strong>
      <span>{e.message ?? "Please try again."}</span>
    </div>
  );
}
export function EmptyState({
  icon,
  heading,
  children,
}: {
  icon?: ReactNode;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h3>{heading}</h3>
      <p>{children}</p>
    </div>
  );
}

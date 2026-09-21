"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main
      className="landing"
      id="main-content"
      style={{ paddingTop: 100, paddingBottom: 100 }}
    >
      <span className="eyebrow">SERVICE INTERRUPTED</span>
      <h1 style={{ fontSize: 40, margin: "22px 0" }}>
        We couldn’t load this view.
      </h1>
      <p style={{ marginBottom: 25 }}>
        Your encrypted vault is still on this device. Retry the view; do not
        clear site data to troubleshoot.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}

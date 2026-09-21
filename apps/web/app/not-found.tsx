import Link from "next/link";
import { Header } from "../components/shell";
export default function NotFound() {
  return (
    <>
      <Header />
      <main
        className="landing"
        id="main-content"
        style={{ paddingTop: 100, paddingBottom: 100 }}
      >
        <span className="eyebrow">404 / NO RESOURCE HERE</span>
        <h1 style={{ fontSize: 45, margin: "22px 0" }}>
          This path is a dead end.
        </h1>
        <p style={{ marginBottom: 30 }}>
          Your credits are still on your device. Let’s get you back to your
          workspace.
        </p>
        <Link href="/app" className="button">
          Back to workspace →
        </Link>
      </main>
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  LayoutDashboard,
  Search,
  Plus,
  ScanLine,
  Terminal,
  BookOpen,
  Activity,
  Globe,
  ChevronRight,
  FlaskConical,
} from "lucide-react";
import { Logo, Badge } from "@blindpass/ui";
const navigation = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/search", label: "Private search", icon: Search },
  { href: "/app/buy", label: "Buy credits", icon: Plus },
];
export function Header() {
  return (
    <header className="public-header">
      <Link href="/" aria-label="BlindPass home">
        <Logo />
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/demo/privacy">The privacy model</Link>
        <Link href="/docs">
          Developers <ArrowUpRight size={13} />
        </Link>
      </nav>
      <Link className="button button-small" href="/app">
        Open app <ArrowUpRight size={15} />
      </Link>
    </header>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error("API unavailable");
      return r.json() as Promise<{
        mode: string;
        environment: string;
        epoch: string;
      }>;
    },
  });
  const title =
    [
      ...navigation,
      { href: "/demo/privacy", label: "Privacy explorer" },
      { href: "/demo", label: "Live protocol demo" },
      { href: "/admin", label: "Merchant view" },
    ].find((n) => n.href === path)?.label ?? "Workspace";
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/" aria-label="BlindPass home">
          <Logo small />
        </Link>
        <div className="workspace-label">
          <span className="workspace-icon">B</span>
          <div>
            Personal workspace<small>Accountless by design</small>
          </div>
          <Badge>LOCAL</Badge>
        </div>
        <div className="nav-group-title">WORKSPACE</div>
        <nav aria-label="Workspace">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${path === item.href ? "active" : ""}`}
            >
              <item.icon size={17} />
              {item.label}
              {path === item.href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="nav-group-title">EXPLORE</div>
        <nav aria-label="Tools">
          <Link
            className={`nav-item ${path === "/demo/privacy" ? "active" : ""}`}
            href="/demo/privacy"
          >
            <ScanLine size={17} />
            Privacy explorer
          </Link>
          <Link
            className={`nav-item ${path === "/demo" ? "active" : ""}`}
            href="/demo"
          >
            <FlaskConical size={17} />
            Live demo<Badge>LAB</Badge>
          </Link>
          <Link className="nav-item" href="/docs">
            <BookOpen size={17} />
            Developer docs
            <ArrowUpRight size={13} />
          </Link>
          {health?.environment !== "production" && (
            <Link
              className={`nav-item ${path === "/admin" ? "active" : ""}`}
              href="/admin"
            >
              <Activity size={17} />
              Merchant view
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="network-card">
            <Globe size={17} />
            <div>
              Direct connection<small>Network metadata is visible</small>
            </div>
            <span className="status-dot amber" />
          </div>
          <Link href="/docs#cli" className="terminal-link">
            <Terminal size={15} /> Prefer the terminal?{" "}
            <ArrowUpRight size={14} />
          </Link>
          <div className="sidebar-footer">
            <span>BlindPass v0.1</span>
            <span className="mono">ZEC × PRIVACY PASS</span>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div>
            <span className="muted">Workspace</span>
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <span className="header-note">
            <span className={`status-dot ${health ? "" : "amber"}`} />
            {health ? "Protocol online" : "Connecting to API"}
          </span>
        </header>
        {health?.mode === "mock" && (
          <div className="dev-banner">
            <FlaskConical size={14} />
            <strong>DEVELOPMENT MODE</strong>
            <span>Zcash payment simulated. Blind credentials are real.</span>
            <Link href="/demo">
              Explore the demo <ArrowUpRight size={12} />
            </Link>
          </div>
        )}
        <main className="workspace-content">{children}</main>
        <footer className="app-footer">
          <span>No account. No API key. Just a private credit.</span>
          <span>
            Payment privacy ≠ network anonymity <Globe size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}

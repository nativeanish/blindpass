import { AppShell } from "../../components/shell";
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

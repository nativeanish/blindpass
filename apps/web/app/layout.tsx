import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";
import "./explorer.css";
import { Providers } from "../components/providers";
export const metadata: Metadata = {
  title: "BlindPass — Pay privately. Use privately.",
  description:
    "Accountless access with shielded ZEC and unlinkable single-use credentials.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

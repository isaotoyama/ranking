import type { Metadata } from "next";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rankbase — Competition ranking infrastructure",
  description: "Flexible round-level results, rankings, player history and ranking APIs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><ClerkProvider>
    <header className="container nav">
      <Link href="/" className="brand">Rankbase</Link>
      <nav className="navlinks" aria-label="Primary">
        <Link href="/rankings" className="hide-mobile">Rankings</Link>
        <Link href="/developers" className="hide-mobile">Developers</Link>
        <Show when="signed-out"><SignInButton mode="modal"><button className="button">Sign in</button></SignInButton></Show>
        <Show when="signed-in"><Link href="/dashboard" className="button">Dashboard</Link><UserButton /></Show>
      </nav>
    </header>
    {children}
    <footer className="container">Rankbase · Competition results are traceable to the underlying round data.</footer>
  </ClerkProvider></body></html>;
}

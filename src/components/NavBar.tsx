"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/apuesta", label: "Mi apuesta" },
  { href: "/grupos", label: "Grupos" },
  { href: "/resultados", label: "Resultados" },
  { href: "/apuestas", label: "Apuestas" },
  { href: "/eliminatorias", label: "Eliminatorias" },
];

export default function NavBar({ user }: { user: string | null }) {
  const pathname = usePathname();
  return (
    <nav className="topbar-nav">
      {NAV_LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname === href ? "nav-active" : undefined}
        >
          {label}
        </Link>
      ))}
      {user === "Javi" && (
        <Link
          href="/admin"
          className={pathname === "/admin" ? "nav-active" : undefined}
        >
          Admin
        </Link>
      )}
    </nav>
  );
}

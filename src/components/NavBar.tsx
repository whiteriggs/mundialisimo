"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UfwcChampion from "@/components/UfwcChampion";

const NAV_LINKS = [
  { href: "/apuesta", label: "Mi apuesta" },
  { href: "/grupos", label: "Grupos" },
  { href: "/resultados", label: "Resultados" },
  { href: "/apuestas", label: "Apuestas" },
  { href: "/eliminatorias", label: "Eliminatorias" },
  { href: "/cronica", label: "Crónica" },
  { href: "/reglas", label: "Reglas" },
];

export default function NavBar({ user }: { user: string | null }) {
  const rawPathname = usePathname();
  // Next.js con trailingSlash:true puede devolver "/apuestas/" — normalizar
  const pathname = rawPathname?.replace(/\/$/, "") || "/";
  const isActive = (href: string) => pathname === href;
  return (
    <>
      <nav className="topbar-nav" style={{ flex: 1, justifyContent: "center" }}>
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "nav-active" : undefined}
          >
            {label}
          </Link>
        ))}
        {user === "Javi" && (
          <Link
            href="/admin"
            className={isActive("/admin") ? "nav-active" : undefined}
          >
            Admin
          </Link>
        )}
      </nav>
      <UfwcChampion compact />
    </>
  );
}

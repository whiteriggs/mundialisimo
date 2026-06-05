"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UfwcChampion from "@/components/UfwcChampion";
import { isGroupAdmin } from "@/lib/group";

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
      <nav className="topbar-nav">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "nav-active" : undefined}
          >
            {label}
          </Link>
        ))}
        {isGroupAdmin(user) && (
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

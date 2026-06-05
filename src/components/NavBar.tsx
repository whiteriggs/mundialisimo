"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import UfwcChampion from "@/components/UfwcChampion";
import NextMatchCountdown from "@/components/NextMatchCountdown";
import { isGroupAdmin } from "@/lib/group";

const NAV_LINKS = [
  { href: "/apuesta", label: "Mi apuesta", icon: "🎯" },
  { href: "/grupos", label: "Grupos", icon: "📊" },
  { href: "/resultados", label: "Resultados", icon: "⚽" },
  { href: "/apuestas", label: "Apuestas", icon: "👥" },
  { href: "/eliminatorias", label: "Eliminatorias", icon: "🏆" },
  { href: "/cronica", label: "Crónica", icon: "📰" },
  { href: "/reglas", label: "Reglas", icon: "📖" },
];

export default function NavBar({ user }: { user: string | null }) {
  const rawPathname = usePathname();
  // Next.js con trailingSlash:true puede devolver "/apuestas/" — normalizar
  const pathname = rawPathname?.replace(/\/$/, "") || "/";
  const isActive = (href: string) => pathname === href;
  const [expanded, setExpanded] = useState(false);

  // Refleja el estado en <body> para que el contenido se desplace a la derecha
  // del rail (desktop) o se muestre el cajón (móvil).
  useEffect(() => {
    document.body.dataset.sidebar = expanded ? "expanded" : "collapsed";
  }, [expanded]);

  useEffect(() => {
    return () => {
      delete document.body.dataset.sidebar;
    };
  }, []);

  const close = () => setExpanded(false);

  return (
    <>
      <button
        type="button"
        className="nav-toggle nav-toggle-mobile"
        aria-label={expanded ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        ☰
      </button>

      <aside className="sidebar" aria-label="Navegación principal">
        <button
          type="button"
          className="nav-toggle nav-toggle-rail"
          aria-label={expanded ? "Contraer menú" : "Expandir menú"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          ☰
        </button>
        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              onClick={close}
              className={isActive(href) ? "nav-active" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span className="nav-label">{label}</span>
            </Link>
          ))}
          {isGroupAdmin(user) && (
            <Link
              href="/admin"
              title="Admin"
              onClick={close}
              className={isActive("/admin") ? "nav-active" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">⚙️</span>
              <span className="nav-label">Admin</span>
            </Link>
          )}
        </nav>
      </aside>

      <div className="nav-backdrop" aria-hidden="true" onClick={close} />

      <div className="topbar-extras">
        <UfwcChampion compact />
        <NextMatchCountdown compact />
      </div>
    </>
  );
}

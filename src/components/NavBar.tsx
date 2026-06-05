"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import UfwcChampion from "@/components/UfwcChampion";
import NextMatchCountdown from "@/components/NextMatchCountdown";
import { isGroupAdmin } from "@/lib/group";

const I = (paths: ReactNode) => (
  <svg
    className="nav-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

const ICON = {
  apuesta: I(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  grupos: I(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 14h18M9 4v16" />
    </>
  ),
  resultados: I(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 9h4M7 13h4M15 9h2M15 13h2" />
    </>
  ),
  apuestas: I(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 19a5.5 5.5 0 0 0-2.7-4.7" />
    </>
  ),
  eliminatorias: I(
    <>
      <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h2.5a2.5 2.5 0 0 1-2.5 4M7 5H4.5A2.5 2.5 0 0 0 7 9" />
      <path d="M12 12v4M9 20h6M10 16h4l.5 4h-5l.5-4Z" />
    </>
  ),
  cronica: I(
    <>
      <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z" />
      <path d="M17 8h3v9a2 2 0 0 1-2 2" />
      <path d="M7 8h7M7 11h7M7 14h4" />
    </>
  ),
  reglas: I(
    <>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z" />
      <path d="M5 18a2 2 0 0 1 2-2h11" />
      <path d="M9 8h6M9 11h4" />
    </>
  ),
  admin: I(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-1.8-3.1-2 .8a7.6 7.6 0 0 0-2.6-1.5l-.3-2.1H8.6l-.3 2.1A7.6 7.6 0 0 0 5.7 5.9l-2-.8L1.9 8.2l1.7 1.3a7.8 7.8 0 0 0 0 3l-1.7 1.3 1.8 3.1 2-.8a7.6 7.6 0 0 0 2.6 1.5l.3 2.1h3.8l.3-2.1a7.6 7.6 0 0 0 2.6-1.5l2 .8 1.8-3.1-1.7-1.3Z" />
    </>
  ),
} as const;

const NAV_LINKS: { href: string; label: string; icon: keyof typeof ICON }[] = [
  { href: "/apuesta", label: "Mi apuesta", icon: "apuesta" },
  { href: "/grupos", label: "Grupos", icon: "grupos" },
  { href: "/resultados", label: "Resultados", icon: "resultados" },
  { href: "/apuestas", label: "Apuestas", icon: "apuestas" },
  { href: "/eliminatorias", label: "Eliminatorias", icon: "eliminatorias" },
  { href: "/cronica", label: "Crónica", icon: "cronica" },
  { href: "/reglas", label: "Reglas", icon: "reglas" },
];

const Burger = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export default function NavBar({ user }: { user: string | null }) {
  const rawPathname = usePathname();
  // Next.js con trailingSlash:true puede devolver "/apuestas/" — normalizar
  const pathname = rawPathname?.replace(/\/$/, "") || "/";
  const isActive = (href: string) => pathname === href;
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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
  const toggle = () => setExpanded((v) => !v);

  // La sidebar se monta como portal en <body> para escapar del stacking
  // context que crea el backdrop-filter del topbar: en Safari/PWA atrapaba
  // los elementos position:fixed dentro del header y la barra se descolocaba.
  const overlay = (
    <>
      <aside className="sidebar" aria-label="Navegación principal">
        <button
          type="button"
          className="nav-toggle nav-toggle-rail"
          aria-label={expanded ? "Contraer menú" : "Expandir menú"}
          aria-expanded={expanded}
          onClick={toggle}
        >
          <Burger />
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
              {ICON[icon]}
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
              {ICON.admin}
              <span className="nav-label">Admin</span>
            </Link>
          )}
        </nav>
      </aside>

      <div className="nav-backdrop" aria-hidden="true" onClick={close} />
    </>
  );

  return (
    <>
      <button
        type="button"
        className="nav-toggle nav-toggle-mobile"
        aria-label={expanded ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={expanded}
        onClick={toggle}
      >
        <Burger />
      </button>

      {mounted && createPortal(overlay, document.body)}

      <div className="topbar-extras">
        <UfwcChampion compact />
        <NextMatchCountdown compact />
      </div>
    </>
  );
}

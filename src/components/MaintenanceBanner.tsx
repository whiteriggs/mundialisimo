"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { probeQuotaExceeded, nextQuotaResetMs } from "@/lib/fsread";

// Aviso global "Servidor en mantenimiento" cuando se detecta la cuota de
// Firestore agotada (429). Visible en todas las pantallas (menos login). Sondea
// una lectura ligera por el Worker; si da 429 muestra el aviso + un contador
// hasta el próximo reinicio de cuota (medianoche hora del Pacífico).
function fmtCountdown(ms: number): string {
  if (ms <= 0) return "ahora mismo";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function MaintenanceBanner() {
  const pathname = usePathname();
  const onLogin = (pathname ?? "").includes("/login");
  const [active, setActive] = useState(false);
  const [countdown, setCountdown] = useState("");

  // Sondeo del estado de cuota cada 30s (refleja el estado ACTUAL).
  useEffect(() => {
    if (onLogin) return;
    let alive = true;
    const check = async () => {
      const down = await probeQuotaExceeded();
      if (alive) setActive(down);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [onLogin]);

  // Contador hasta el reinicio.
  useEffect(() => {
    if (!active) return;
    const tick = () => setCountdown(fmtCountdown(nextQuotaResetMs() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || onLogin) return null;

  return (
    <div className="maint-banner" role="status">
      <span className="maint-icon">🔧</span>
      <span className="maint-text">Servidor en mantenimiento</span>
      {countdown && (
        <span className="maint-countdown">· se restablece en <strong>{countdown}</strong></span>
      )}
    </div>
  );
}

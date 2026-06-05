"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ApuestasRedirect() {
  const router = useRouter();

  useEffect(() => {
    const qs = window.location.search;
    router.replace(`/apuesta${qs}`);
  }, [router]);

  return (
    <main className="app-shell">
      <div className="loading-screen"><p className="muted">Redirigiendo…</p></div>
    </main>
  );
}

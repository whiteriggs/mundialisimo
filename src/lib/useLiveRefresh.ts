import { useEffect, useRef } from "react";

// Ejecuta `refresh` en intervalos para mantener los datos en vivo. Solo refresca
// cuando la pestaña está visible y vuelve a refrescar al recuperar el foco, para
// no malgastar peticiones mientras la app está en segundo plano. El intervalo es
// dinámico: las páginas pasan uno corto cuando hay partidos en directo para que
// todos los dispositivos converjan rápido (la caché de 30s del Worker protege la
// API real aunque se pollee a menudo).
export function useLiveRefresh(refresh: () => void, intervalMs = 30_000) {
  const ref = useRef(refresh);
  useEffect(() => {
    ref.current = refresh;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}

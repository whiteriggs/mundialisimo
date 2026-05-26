"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      navigator.serviceWorker
        .register(`${basePath}/sw.js`)
        .catch(console.error);
    }
  }, []);

  return null;
}

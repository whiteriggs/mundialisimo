import Link from "next/link";

const rules = [
  "Cada apuesta incluye 9-12 favoritos y 4-6 antifavoritos.",
  "Solo un favorito y un antifavorito por grupo.",
  "La puntuacion final: favoritos menos antifavoritos.",
  "Las apuestas identicas se validan por orden de registro y pago."
];

const scoring = [
  "Fase de grupos y tercer puesto: +1 gol, +5 empate, +10 victoria.",
  "Eliminatorias: +1 gol, +5 por jugar, +5 empate, +10 victoria.",
  "Partidos decididos por penaltis cuentan como empate.",
  "Los goles en tanda no puntuan."
];

const tieBreakers = [
  "Mejor media de posicion de favoritos en el ranking final (1-32).",
  "Si persiste el empate, decide el superfavorito.",
  "Ultimo criterio: orden de inscripcion."
];

export default function Home() {
  return (
    <main className="page shell">
      <section className="hero card glow-panel">
        <div className="hero-top">
          <p className="eyebrow">Mundialisimo 2026</p>
          <span className="soft-pill">12 grupos · 48 selecciones</span>
        </div>
        <h1>Porra moderna para un mundial mas grande</h1>
        <p className="lead">
          Bienvenido. Aqui tienes reglas claras, puntuacion transparente y una
          experiencia cuidada para empezar sin friccion.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/apuesta-demo">
            Crear apuesta demo
          </Link>
          <a className="btn btn-secondary" href="#reglamento">
            Ver reglamento
          </a>
        </div>
        <div className="metric-strip">
          <article>
            <p>Favoritos</p>
            <strong>9-12</strong>
          </article>
          <article>
            <p>Antifavoritos</p>
            <strong>4-6</strong>
          </article>
          <article>
            <p>Ticket valido</p>
            <strong>10-15 euros</strong>
          </article>
        </div>
      </section>

      <section className="grid" id="reglamento">
        <article className="card">
          <h2>Como funciona</h2>
          <ul>
            {rules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Puntuacion por partido</h2>
          <ul>
            {scoring.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card">
          <h2>Desempates</h2>
          <ul>
            {tieBreakers.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="card highlight">
          <h2>Roadmap</h2>
          <p>
            Esta fase abre con reglamento y simulador. El siguiente paso sera
            habilitar usuarios, login y registro real de apuestas.
          </p>
          <p className="muted">Objetivo: experiencia simple, precisa y sin ruido.</p>
        </article>
      </section>
    </main>
  );
}

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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          <h1>Mundialisimo</h1>
          <span className="sub">Porra del Mundial 2026 adaptada a 12 grupos de 4</span>
        </div>
        <Link className="mini-action" href="/login">
          Hacer mi apuesta
        </Link>
      </header>

      <section className="hero">
        <div className="hero-inner home-hero">
          <div>
            <div className="hero-eyebrow">Mundialisimo 2026</div>
            <h2 className="hero-name">Una porra elegante, clara y competitiva</h2>
            <p className="lead">
              Reglas simples, puntuacion transparente y desempates definidos para
              jugar sin dudas desde el primer partido.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/login">
                Hacer mi apuesta
              </Link>
              <Link className="btn btn-ghost" href="/apuesta-demo">
                Probar demo
              </Link>
              <a className="btn btn-ghost" href="#reglamento">
                Ver reglamento
              </a>
            </div>
          </div>
          <div className="hero-counter">
            <span className="hero-counter-n">12</span>
            <span className="hero-counter-l">grupos en 2026</span>
          </div>
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

import Link from "next/link";

const rules = [
  "Cada apuesta debe incluir entre 9 y 12 favoritos y entre 4 y 6 antifavoritos.",
  "No se puede repetir grupo: maximo 1 favorito y 1 antifavorito por grupo.",
  "La puntuacion de una apuesta es: puntos de favoritos menos puntos de antifavoritos.",
  "No se admiten apuestas identicas; cuenta primero la que se registra y se paga."
];

const scoring = [
  "Grupos y partido por el tercer puesto: +1 gol, +5 empate, +10 victoria.",
  "Eliminatorias: +1 gol, +5 por jugar ronda, +5 empate, +10 victoria.",
  "Si hay penaltis, el partido cuenta como empate para la porra.",
  "Los goles en tandas de penaltis no suman puntos."
];

const tieBreakers = [
  "Mejor media de posicion final de los favoritos (ranking final del 1 al 32).",
  "Si persiste empate: se aplica el superfavorito declarado tras cierre.",
  "Ultimo criterio: orden de inscripcion de la apuesta."
];

export default function Home() {
  return (
    <main className="page">
      <section className="hero card">
        <p className="eyebrow">Mundialisimo 2026</p>
        <h1>Bienvenido a la porra</h1>
        <p className="lead">
          Esta web centraliza reglas, puntuaciones y clasificacion para el Mundial
          2026. El sistema esta adaptado al nuevo formato de 12 grupos de 4.
        </p>
        <div className="hero-actions">
          <Link className="btn" href="/apuesta-demo">
            Probar creador de apuesta
          </Link>
        </div>
      </section>

      <section className="grid">
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
          <h2>Estado actual</h2>
          <p>
            Esta primera version sirve como portal de informacion y reglamento.
            En la siguiente fase anadiremos usuarios, login y creacion de
            apuestas online.
          </p>
        </article>
      </section>
    </main>
  );
}

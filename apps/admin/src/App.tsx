import { useState } from "react";

const modules = [
  "Dashboard",
  "Corridas",
  "Motoristas",
  "Passageiros",
  "Veículos",
  "Financeiro",
  "Tarifas",
  "Suporte"
];

export default function App() {
  const [active, setActive] = useState("Dashboard");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">SancaMobi</div>
        <div className="brand-subtitle">Painel administrativo</div>
        <nav>
          {modules.map((module) => (
            <button
              key={module}
              className={active === module ? "nav-item active" : "nav-item"}
              onClick={() => setActive(module)}
            >
              {module}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="header">
          <div>
            <h1>{active}</h1>
            <p>Operação de mobilidade urbana em São Carlos</p>
          </div>
          <span className="environment">DESENVOLVIMENTO</span>
        </header>
        <section className="cards">
          <article><strong>0</strong><span>Corridas hoje</span></article>
          <article><strong>0</strong><span>Motoristas online</span></article>
          <article><strong>R$ 0,00</strong><span>Faturamento hoje</span></article>
          <article><strong>0</strong><span>Solicitações abertas</span></article>
        </section>
        <section className="panel">
          <h2>{active}</h2>
          <p>Módulo base criado. A próxima camada será conectada ao Firebase e às regras operacionais do SancaMobi.</p>
        </section>
      </main>
    </div>
  );
}

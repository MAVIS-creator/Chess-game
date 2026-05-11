import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Three.js Chess Runtime</p>
      <h1>Preparing the wooden chess set for play.</h1>
      <p class="lede">
        The 3D scene, chess rules, and game HUD will load here in the next phases.
      </p>
      <div class="status-card">
        <span>Asset path</span>
        <strong>/wooden_chess_set.glb</strong>
      </div>
    </section>
  </main>
`;

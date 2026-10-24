import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Placeholder until the panels land (block B): login, summary, sales, plant, purchasing, inventory.
function App() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md text-center">
        <p className="text-4xl font-semibold tracking-tight [font-stretch:115%]">SCIP</p>
        <p className="mt-2 text-ink-2">
          Control de inventario, producción y sobreventa · NOW CLEANY
        </p>
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Falta el elemento #root');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

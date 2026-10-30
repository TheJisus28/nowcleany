import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { errorMessage } from '../../api/client';
import { useSession } from '../../auth/session';
import { BrandLockup } from '../../components/brand';
import { Button, Field, Input } from '../../components/ui';

// Only in development builds: one click fills a demo account per role.
const DEMO_ACCOUNTS = [
  ['gerencia@nowcleany.local', 'Gerencia'],
  ['vendedor.a@nowcleany.local', 'Ventas · Andrea'],
  ['planta@nowcleany.local', 'Planta'],
  ['compras@nowcleany.local', 'Compras'],
  ['bodega@nowcleany.local', 'Bodega'],
  ['jefe.tecnico@nowcleany.local', 'Jefe técnico'],
] as const;

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session.status === 'authenticated' && session.profile) {
    // Back to the page that asked for the session (a shared link), or to the role's home.
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (event: { preventDefault(): void }) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await session.login(email, password);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand px-12 py-12 text-white lg:flex lg:flex-col">
        <BrandLockup inverted large />
        <div className="mt-auto max-w-lg">
          <p className="text-[40px] leading-[1.08] font-semibold tracking-[-0.02em] [font-stretch:110%]">
            Lo vendido, lo que hay y lo que falta, en una sola cuenta.
          </p>
          <p className="mt-5 text-[17px] text-white/75">
            Ventas, planta y compras trabajan sobre los mismos números desde que se confirma una
            preventa.
          </p>
        </div>
        {/* The level line of the mark, as a quiet horizon across the panel. */}
        <div aria-hidden className="absolute inset-x-0 bottom-[38%] h-[3px] bg-aqua/80" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-[38%] bg-white/[0.06]" />
        <p className="relative mt-16 text-[13px] text-white/60">
          Plataforma interna de Now Cleany S.A.S. · Montería
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <BrandLockup />
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight [font-stretch:110%]">
            Inicia sesión
          </h1>

          <form
            className="mt-8 flex flex-col gap-4"
            onSubmit={(event) => void submit(event)}
            noValidate
          >
            <Field label="Correo">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Contraseña">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                />
              )}
            </Field>
            {error ? (
              <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-sm text-ink">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              loading={submitting}
              disabled={!email || !password}
              icon={<LogIn className="size-4" />}
              className="mt-2 h-11"
            >
              Entrar
            </Button>
          </form>

          {import.meta.env.DEV ? (
            <details className="mt-10 rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-ink-2">
                Usuarios de demostración
              </summary>
              <p className="mt-2 text-[13px] text-ink-3">
                Contraseña: la de DEMO_PASSWORD en .env.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map(([account, label]) => (
                  <button
                    key={account}
                    type="button"
                    onClick={() => {
                      setEmail(account);
                    }}
                    className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-ink-2 hover:border-brand hover:text-ink"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>
    </div>
  );
}

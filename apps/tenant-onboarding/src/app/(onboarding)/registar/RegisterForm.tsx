'use client';

/**
 * Formulário cliente da página /registar.
 *
 * Estado local (useState), validação no client (zod partilhada), fetch
 * ao endpoint POST /api/auth/register. Em sucesso, redireciona para
 * `/salon` (passo 2 do wizard) usando `router.push`.
 *
 * Validação:
 *  - email: RFC básico
 *  - password: >= 12 chars + minúscula + maiúscula + dígito + símbolo
 *  - name: 1..100 chars
 */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

const SYMBOL_REGEX = /[!@#$%^&*_\-+=]/;

const ClientRegisterSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(12)
    .max(256)
    .refine((v) => /[a-z]/.test(v), 'Inclui pelo menos uma minúscula')
    .refine((v) => /[A-Z]/.test(v), 'Inclui pelo menos uma maiúscula')
    .refine((v) => /[0-9]/.test(v), 'Inclui pelo menos um dígito')
    .refine((v) => SYMBOL_REGEX.test(v), 'Inclui pelo menos um símbolo'),
  name: z.string().min(1).max(100),
});

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = email.length > 0 && /.+@.+\..+/.test(email);
  const passwordStrong =
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    SYMBOL_REGEX.test(password);
  const nameValid = name.trim().length > 0 && name.length <= 100;
  const formValid = emailValid && passwordStrong && nameValid && !submitting;

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsed = ClientRegisterSchema.safeParse({ email, password, name });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? 'Verifica os dados introduzidos.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? `Erro ${response.status} a criar a conta.`);
        setSubmitting(false);
        return;
      }
      router.push('/salon');
    } catch {
      setError('Sem ligação ao servidor. Tenta novamente.');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6"
      data-testid="register-form"
      aria-label="Formulário de criação de conta"
    >
      <div>
        <label
          htmlFor="register-name"
          className="block text-sm font-medium text-slate-700"
        >
          Nome
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </div>

      <div>
        <label
          htmlFor="register-email"
          className="block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
      </div>

      <div>
        <label
          htmlFor="register-password"
          className="block text-sm font-medium text-slate-700"
        >
          Password
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        <p className="mt-1 text-xs text-slate-500">
          Mínimo 12 caracteres, com maiúscula, minúscula, dígito e símbolo.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!formValid}
        className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="register-submit"
      >
        {submitting ? 'A criar…' : 'Continuar'}
      </button>
    </form>
  );
}

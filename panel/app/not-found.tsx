import Link from 'next/link';

export default function NoEncontrada() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">Esta página no existe</h1>
      <p className="text-sm text-suave">Revisa la dirección o vuelve al inicio.</p>
      <Link href="/" className="flex min-h-11 items-center rounded-lg bg-marca px-5 font-semibold text-white hover:bg-marca-oscura">
        Ir al inicio
      </Link>
    </main>
  );
}

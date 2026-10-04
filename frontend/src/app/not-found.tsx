import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-gold">404</p>
      <h1 className="mt-3 font-serif text-5xl tracking-tight">That page is not on the desk.</h1>
      <Link href="/" className="mt-6 inline-block text-gold">
        Return home
      </Link>
    </div>
  );
}

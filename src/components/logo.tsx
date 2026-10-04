// Brand mark: the fox reading through a magnifying glass (public/logo.svg).
export function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="Bina.ai" width={size} height={Math.round(size * 1.09)} className={`shrink-0 ${className}`} />;
}

export function Wordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      <span className="font-serif text-[1.35rem] leading-none tracking-tight text-paper">
        Bina<span className="text-gold">.ai</span>
      </span>
    </span>
  );
}

/** Marca Clyvo Map: o "C" da Clyvo + nome. */
export function SimboloClyvo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 48" height={size} width={(size * 60) / 48} aria-hidden="true">
      <defs>
        <linearGradient id="clyvo-c" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor="#3AB6FF" /><stop offset="1" stopColor="#2563FF" /></linearGradient>
      </defs>
      <path d="M57 4H38.5a20 20 0 0 0 0 40H57l-4.5-8.5H38.5a11.5 11.5 0 0 1 0-23H52.5Z" fill="url(#clyvo-c)" />
      <rect x="0" y="20.5" width="5.5" height="5.5" rx="1.2" fill="#2F7BFF" />
      <rect x="8.5" y="13.5" width="5.5" height="5.5" rx="1.2" fill="#3AA9FF" />
      <rect x="8.5" y="20.5" width="5.5" height="5.5" rx="1.2" fill="#2F7BFF" />
      <rect x="8.5" y="28" width="5.5" height="5.5" rx="1.2" fill="#2F7BFF" opacity=".75" />
      <rect x="16.5" y="18.5" width="8" height="9.5" rx="1.6" fill="#3AA9FF" />
    </svg>
  )
}

export default function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="marca">
      <SimboloClyvo size={compacta ? 20 : 26} />
      <span className="marca-nome">Clyvo <b>Map</b></span>
    </span>
  )
}

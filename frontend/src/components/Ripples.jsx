// Lingkaran riak air sebagai latar halaman login. Murni dekoratif.
export default function Ripples({ className }) {
  return (
    <svg className={className} viewBox="0 0 400 400" fill="none" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      {[40, 90, 145, 205, 270, 340].map((r, i) => (
        <circle key={r} cx="300" cy="320" r={r} stroke="#fff" strokeOpacity={0.2 - i * 0.025} strokeWidth="2" />
      ))}
    </svg>
  );
}

export function DropMark({ className = 'size-10' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#fff" />
      <path d="M32 12c8 10 14 17 14 25a14 14 0 0 1-28 0c0-8 6-15 14-25z" fill="#0B5FA5" />
    </svg>
  );
}

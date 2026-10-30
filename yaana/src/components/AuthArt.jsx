function Person({ x, y, shirt, bag, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="22" cy="16" r="14" fill="#F4C7A5" stroke="#071B2D" strokeWidth="5" />
      <rect x="8" y="30" width="28" height="32" rx="8" fill={shirt} stroke="#071B2D" strokeWidth="5" />
      <rect x="32" y="34" width="14" height="20" rx="4" fill={bag} stroke="#071B2D" strokeWidth="5" />
      <rect x="11" y="60" width="9" height="20" rx="4" fill="#071B2D" />
      <rect x="24" y="60" width="9" height="20" rx="4" fill="#071B2D" />
    </g>
  );
}

export default function AuthArt() {
  return (
    <svg
      className="auth-art"
      viewBox="0 0 800 1100"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Simple illustration of students waiting beside a green-and-yellow auto."
    >
      <rect width="800" height="1100" fill="#FF5C78" />
      <circle cx="640" cy="150" r="72" fill="#FFC928" stroke="#071B2D" strokeWidth="8" />
      <rect x="90" y="120" width="160" height="40" rx="20" fill="#FFF8EC" />
      <rect x="180" y="168" width="120" height="30" rx="15" fill="#FFF8EC" />

      <ellipse cx="180" cy="430" rx="220" ry="90" fill="#08794F" />
      <ellipse cx="620" cy="400" rx="260" ry="110" fill="#0B9A64" stroke="#071B2D" strokeWidth="8" />
      <rect x="0" y="470" width="800" height="630" fill="#FFF8EC" />

      <rect x="578" y="250" width="22" height="230" rx="6" fill="#7A4A2B" stroke="#071B2D" strokeWidth="6" />
      <circle cx="590" cy="230" r="78" fill="#08794F" stroke="#071B2D" strokeWidth="8" />
      <circle cx="530" cy="270" r="40" fill="#0B9A64" stroke="#071B2D" strokeWidth="6" />

      <rect x="70" y="330" width="70" height="150" fill="#FFF8EC" stroke="#071B2D" strokeWidth="7" />
      <rect x="140" y="280" width="86" height="200" fill="#FFF8EC" stroke="#071B2D" strokeWidth="7" />
      <rect x="70" y="300" width="156" height="18" fill="#071B2D" />
      <rect x="86" y="352" width="18" height="18" fill="#168ED0" />
      <rect x="114" y="352" width="18" height="18" fill="#168ED0" />
      <rect x="158" y="308" width="18" height="18" fill="#FFC928" />
      <rect x="186" y="308" width="18" height="18" fill="#FFC928" />
      <rect x="158" y="336" width="18" height="18" fill="#FFC928" />
      <rect x="186" y="336" width="18" height="18" fill="#FFC928" />

      <path d="M40 820 C 180 760, 340 880, 520 790 S 720 740, 800 800" fill="none" stroke="#FFC928" strokeWidth="14" strokeLinecap="round" />

      <Person x={86} y={678} shirt="#071B2D" bag="#FFC928" scale={1.85} />
      <Person x={188} y={708} shirt="#168ED0" bag="#FF5C78" scale={1.55} />

      <g transform="translate(300 620)">
        <circle cx="78" cy="214" r="32" fill="#071B2D" />
        <circle cx="78" cy="214" r="12" fill="#FFF8EC" />
        <circle cx="286" cy="214" r="36" fill="#071B2D" />
        <circle cx="286" cy="214" r="13" fill="#FFF8EC" />
        <path d="M86 118 H 300 L 318 186 H 58 Z" fill="#08794F" stroke="#071B2D" strokeWidth="8" strokeLinejoin="round" />
        <path d="M108 118 L 286 118 L 268 58 L 138 58 Z" fill="#FFC928" stroke="#071B2D" strokeWidth="8" strokeLinejoin="round" />
        <rect x="168" y="72" width="86" height="52" rx="10" fill="#FFF8EC" stroke="#071B2D" strokeWidth="6" />
        <path d="M58 148 L 86 118 L 86 186 L 32 186 Z" fill="#FFC928" stroke="#071B2D" strokeWidth="7" strokeLinejoin="round" />
        <rect x="8" y="136" width="42" height="12" rx="6" fill="#071B2D" />
        <circle cx="10" cy="142" r="8" fill="#071B2D" />
        <rect x="168" y="140" width="50" height="28" rx="6" fill="#FFC928" stroke="#071B2D" strokeWidth="5" />
        <text x="193" y="160" textAnchor="middle" fill="#071B2D" fontFamily="Manrope, sans-serif" fontSize="16" fontWeight="800">09</text>
      </g>
    </svg>
  );
}

/** Generic, original equipment illustrations (NOT photos, NOT manufacturer artwork). Replace with licensed photography via the admin image field. */
const steel = "#b4bec9", dark = "#414b58", light = "#e8ecf0", accent = "#00a0e4";

function Fan({ cx, cy, r = 20 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#1b2026" stroke={steel} strokeWidth="2" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx={cx} cy={cy - r * 0.45} rx={r * 0.18} ry={r * 0.42} fill={steel} transform={`rotate(${a} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.14} fill={accent} />
    </g>
  );
}
const Pipe = ({ d, c = accent }: { d: string; c?: string }) => <path d={d} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
const Box = (p: React.SVGProps<SVGRectElement>) => <rect rx="4" fill={light} stroke={dark} strokeWidth="2" {...p} />;

const ART: Record<string, React.ReactNode> = {
  "air-cooled-chillers": (<>
    <Box x="40" y="110" width="320" height="80" /><Box x="40" y="88" width="320" height="26" fill={steel} />
    <Fan cx={100} cy={60} /><Fan cx={200} cy={60} /><Fan cx={300} cy={60} />
    {Array.from({ length: 16 }).map((_, i) => <line key={i} x1={52 + i * 19.5} y1="122" x2={52 + i * 19.5} y2="180" stroke={steel} strokeWidth="3" />)}
    <rect x="30" y="190" width="340" height="8" fill={dark} /><Pipe d="M360 165 H385" />
  </>),
  "water-cooled-chillers": (<>
    <rect x="50" y="85" width="260" height="46" rx="23" fill={light} stroke={dark} strokeWidth="2" />
    <rect x="70" y="145" width="220" height="38" rx="19" fill={steel} stroke={dark} strokeWidth="2" />
    <Box x="305" y="95" width="45" height="80" fill={steel} /><circle cx="327" cy="135" r="12" fill="#1b2026" stroke={accent} strokeWidth="2" />
    <Pipe d="M95 85 V50 H20" /><Pipe d="M135 85 V30 H20" c="#7799cc" /><Pipe d="M255 183 V210 H380" c="#7799cc" /><Pipe d="M215 183 V222 H380" />
    <rect x="40" y="192" width="270" height="8" fill={dark} />
  </>),
  "vrv-vrf": (<>
    <Box x="35" y="70" width="150" height="130" /><Fan cx={110} cy={130} r={42} />
    <Box x="240" y="55" width="125" height="36" fill={steel} /><Box x="260" y="130" width="85" height="30" fill={steel} /><Box x="230" y="175" width="125" height="28" fill={steel} />
    <Pipe d="M185 100 H215 V73 H240" /><Pipe d="M185 130 H215 V145 H260" /><Pipe d="M185 160 H215 V189 H230" c="#7799cc" />
  </>),
  ahu: (<>
    <Box x="25" y="90" width="85" height="90" fill={steel} /><Box x="110" y="90" width="85" height="90" /><Box x="195" y="90" width="85" height="90" fill={steel} /><Box x="280" y="90" width="95" height="90" />
    {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={122 + i * 14} y1="100" x2={122 + i * 14} y2="170" stroke={accent} strokeWidth="3" />)}
    <Fan cx={327} cy={135} r={30} />
    <path d="M5 135 H22 M18 128 L26 135 L18 142" stroke={accent} strokeWidth="4" fill="none" /><path d="M376 135 H395 M388 128 L396 135 L388 142" stroke={accent} strokeWidth="4" fill="none" />
    <rect x="15" y="180" width="370" height="8" fill={dark} />
  </>),
  fahu: (<>
    <Box x="40" y="85" width="330" height="95" /><circle cx="120" cy="132" r="38" fill="#1b2026" stroke={steel} strokeWidth="3" />
    {[0, 45, 90, 135].map((a) => <line key={a} x1="120" y1="94" x2="120" y2="170" stroke={accent} strokeWidth="3" transform={`rotate(${a} 120 132)`} />)}
    <Box x="190" y="95" width="55" height="75" fill={steel} /><Fan cx={310} cy={132} r={32} />
    <path d="M5 110 H38 M30 102 L40 110 L30 118" stroke={accent} strokeWidth="4" fill="none" /><path d="M372 150 H398 M390 142 L399 150 L390 158" stroke={accent} strokeWidth="4" fill="none" />
    <rect x="30" y="180" width="350" height="8" fill={dark} />
  </>),
  fcu: (<>
    <Box x="70" y="80" width="260" height="70" /><Fan cx={140} cy={115} r={26} /><Fan cx={260} cy={115} r={26} />
    <rect x="60" y="150" width="280" height="14" rx="3" fill={steel} stroke={dark} strokeWidth="2" />
    <Pipe d="M110 80 V40 H20" /><Pipe d="M150 80 V25 H20" c="#7799cc" /><Pipe d="M300 150 V195 H385" c="#7799cc" />
    {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={85 + i * 45} y1="158" x2={80 + i * 45} y2="175" stroke={steel} strokeWidth="3" />)}
  </>),
  "dx-split": (<>
    <Box x="25" y="55" width="190" height="55" /><line x1="35" y1="95" x2="205" y2="95" stroke={steel} strokeWidth="3" /><circle cx="190" cy="75" r="4" fill={accent} />
    <Box x="260" y="110" width="120" height="85" fill={steel} /><Fan cx={320} cy={152} r={30} />
    <Pipe d="M60 110 V150 H245 V165 H260" /><Pipe d="M85 110 V135 H235 V150 H260" c="#7799cc" />
  </>),
  "packaged-ac": (<>
    <rect x="40" y="188" width="320" height="10" fill={dark} /><Box x="60" y="100" width="280" height="88" />
    <Fan cx={130} cy={80} r={24} /><rect x="105" y="100" width="50" height="6" fill={steel} />
    <Box x="190" y="115" width="130" height="55" fill={steel} />
    <Box x="335" y="125" width="55" height="40" fill={steel} /><Box x="10" y="125" width="55" height="40" fill={steel} />
    <path d="M30 120 V105 M375 120 V105" stroke={accent} strokeWidth="4" />
  </>),
  "controls-bms": (<>
    <Box x="60" y="55" width="130" height="150" /><rect x="75" y="72" width="100" height="55" rx="3" fill="#0a1a35" stroke={accent} strokeWidth="2" />
    <polyline points="82,115 105,100 125,108 150,86 168,92" fill="none" stroke={accent} strokeWidth="2.5" />
    {[0, 1, 2, 3].map((i) => <circle key={i} cx={90 + i * 24} cy="155" r="7" fill={i % 2 ? accent : steel} />)}
    <g stroke={steel} strokeWidth="3" fill="none"><path d="M190 100 H250 M250 100 V60 H300 M250 100 V145 H300 M250 100 H300" /></g>
    {[[300, 60], [300, 100], [300, 145]].map(([x, y]) => <rect key={y} x={x} y={y - 16} width="70" height="32" rx="4" fill={light} stroke={dark} strokeWidth="2" />)}
  </>),
  "chilled-water-systems": (<>
    <Pipe d="M20 80 H180 M220 80 H380" c="#7799cc" /><Pipe d="M20 160 H180 M220 160 H380" />
    <circle cx="200" cy="120" r="34" fill={light} stroke={dark} strokeWidth="3" /><Fan cx={200} cy={120} r={22} />
    <Pipe d="M200 86 V80" c="#7799cc" /><Pipe d="M200 154 V160" />
    <rect x="70" y="68" width="14" height="24" fill={dark} /><rect x="320" y="148" width="14" height="24" fill={dark} />
    <path d="M120 70 L140 90 M140 70 L120 90" stroke={accent} strokeWidth="3" />
    <rect x="300" y="64" width="50" height="32" rx="4" fill={steel} stroke={dark} strokeWidth="2" />
  </>),
};

export function EquipmentArt({ slug, className = "" }: { slug: string; className?: string }) {
  return (
    <svg viewBox="0 0 400 240" role="img" aria-label="Generic equipment illustration" className={className}>
      <defs><linearGradient id={`bg-${slug}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0f2548" /><stop offset="1" stopColor="#06101f" /></linearGradient></defs>
      <rect width="400" height="240" fill={`url(#bg-${slug})`} />
      <g opacity=".08" stroke="#fff">{Array.from({ length: 10 }).map((_, i) => <line key={i} x1={i * 44} y1="0" x2={i * 44} y2="240" />)}</g>
      {ART[slug] ?? ART["ahu"]}
    </svg>
  );
}

/** Larger labelled schematic used by DiagramViewer (viewBox 100×80 so hotspots map as x%, y% of width/height). */
export function ChillerSchematic() {
  return (
    <svg viewBox="0 0 100 80" className="h-full w-full" role="img" aria-label="Generic air-cooled chiller schematic">
      <rect width="100" height="80" fill="#f5f7f9" />
      <rect x="6" y="14" width="88" height="46" rx="2" fill="#e8ecf0" stroke="#414b58" strokeWidth=".6" />
      <rect x="8" y="10" width="46" height="14" rx="1.5" fill="#d3d9e0" stroke="#414b58" strokeWidth=".5" />
      {[16, 28, 40].map((x) => (
        <g key={x}><circle cx={x} cy="17.5" r="5" fill="#1b2026" stroke="#8d9aa9" strokeWidth=".5" />
          {[0, 60, 120].map((a) => <ellipse key={a} cx={x} cy="15.5" rx=".9" ry="2.2" fill="#b4bec9" transform={`rotate(${a} ${x} 17.5)`} />)}</g>
      ))}
      <rect x="56" y="14" width="36" height="30" fill="#c8d3e0" stroke="#414b58" strokeWidth=".5" />
      {Array.from({ length: 12 }).map((_, i) => <line key={i} x1={58 + i * 3} y1="15" x2={58 + i * 3} y2="43" stroke="#8d9aa9" strokeWidth=".6" />)}
      <rect x="7" y="30" width="12" height="28" rx="1" fill="#0f2548" stroke="#414b58" strokeWidth=".5" />
      <rect x="9" y="33" width="8" height="6" fill="#00a0e4" opacity=".7" />
      <rect x="24" y="38" width="10" height="16" rx="3" fill="#7799cc" stroke="#414b58" strokeWidth=".5" />
      <rect x="36" y="38" width="10" height="16" rx="3" fill="#7799cc" stroke="#414b58" strokeWidth=".5" />
      <rect x="50" y="48" width="30" height="10" rx="5" fill="#a9bfe0" stroke="#414b58" strokeWidth=".5" />
      <path d="M80 53 H96 M80 56 H96" stroke="#00a0e4" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4" y="60" width="92" height="3" fill="#414b58" /><rect x="10" y="63" width="6" height="3" fill="#1b2026" /><rect x="84" y="63" width="6" height="3" fill="#1b2026" />
    </svg>
  );
}

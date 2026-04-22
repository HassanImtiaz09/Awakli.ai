/**
 * CharacterChip — Small pill showing a character name.
 * Click triggers global rename propagation via parent callback.
 * Color is deterministic based on name hash for visual consistency.
 */

interface CharacterChipProps {
  name: string;
  onClick?: () => void;
  size?: "sm" | "md";
}

// Deterministic color palette for character chips
const CHIP_COLORS = [
  { bg: "bg-[#6B5BFF]/10", text: "text-[#6B5BFF]", border: "border-[#6B5BFF]/20" },
  { bg: "bg-[#00F0FF]/10", text: "text-[#00F0FF]", border: "border-[#00F0FF]/20" },
  { bg: "bg-[#FF2D7A]/10", text: "text-[#FF2D7A]", border: "border-[#FF2D7A]/20" },
  { bg: "bg-emerald-400/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  { bg: "bg-amber-400/10", text: "text-amber-400", border: "border-amber-400/20" },
  { bg: "bg-rose-400/10", text: "text-rose-400", border: "border-rose-400/20" },
  { bg: "bg-sky-400/10", text: "text-sky-400", border: "border-sky-400/20" },
  { bg: "bg-lime-400/10", text: "text-lime-400", border: "border-lime-400/20" },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function CharacterChip({ name, onClick, size = "sm" }: CharacterChipProps) {
  const color = CHIP_COLORS[hashName(name) % CHIP_COLORS.length];
  const initial = name.charAt(0).toUpperCase();

  const sizeClasses = size === "sm"
    ? "text-[10px] px-2 py-0.5 gap-1"
    : "text-xs px-2.5 py-1 gap-1.5";

  const avatarSize = size === "sm" ? "w-3.5 h-3.5 text-[8px]" : "w-4.5 h-4.5 text-[10px]";

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full border ${color.bg} ${color.text} ${color.border} ${sizeClasses} font-medium transition-all hover:opacity-80 active:scale-95`}
      title={`Click to rename "${name}" globally`}
    >
      <span
        className={`${avatarSize} rounded-full ${color.bg} grid place-items-center font-bold flex-shrink-0`}
      >
        {initial}
      </span>
      {name}
    </button>
  );
}

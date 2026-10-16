import type { ComponentType } from "react";
import {
  Award,
  Backpack,
  Crown,
  Flame,
  Footprints,
  Gem,
  Gift,
  Glasses,
  Heart,
  Moon,
  Package,
  Ruler,
  Scissors,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Tag,
  Watch,
  Zap,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Hand-drawn glyphs - lucide ships no jeans or sneaker icon. */
function JeansIcon(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={cn("size-4 shrink-0", props.className)}
    >
      {/* Legs, waistband, fly. */}
      <path d="M7 3h10l1 18h-4l-2-9-2 9H6z" />
      <path d="M7 6h10" />
      <path d="M12 6v3.5" />
    </svg>
  );
}

function SneakerIcon(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={cn("size-4 shrink-0", props.className)}
    >
      {/* Heel, collar, instep, toe. */}
      <path d="M4 17V10a1.5 1.5 0 0 1 1.5-1.5H9l2 3 3.5 1.5a6 6 0 0 1 3.7 2.7l.8 1.3" />
      {/* Sole with toe kick. */}
      <path d="M2 17h17c.9 0 1.7-.4 2.3-1.1" />
      {/* Laces. */}
      <path d="M10.3 10.5 9.9 12.2" />
      <path d="M13 12.4 12.6 14.1" />
      {/* Toe seam. */}
      <path d="M15.9 13.6c.7 1 1.2 2.1 1.4 3.4" />
    </svg>
  );
}

/** Icon keys per Category.ICON_CHOICES; unknown values fall back to Tag. */
const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  tag: Tag,
  shirt: Shirt,
  jeans: JeansIcon,
  sneakers: SneakerIcon,
  watch: Watch,
  gem: Gem,
  glasses: Glasses,
  backpack: Backpack,
  "shopping-bag": ShoppingBag,
  package: Package,
  scissors: Scissors,
  footprints: Footprints,
  sparkles: Sparkles,
  crown: Crown,
  flame: Flame,
  star: Star,
  heart: Heart,
  gift: Gift,
  sun: Sun,
  moon: Moon,
  zap: Zap,
  award: Award,
  ruler: Ruler,
};

/** Mirrors catalog.models.Category.ICON_CHOICES for the admin dropdown. */
export const CATEGORY_ICON_CHOICES = Object.keys(CATEGORY_ICONS).map((key) => ({
  value: key,
  // "shopping-bag" -> "Shopping bag"
  label: key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, " "),
}));

export function CategoryIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return (
    <Icon className={cn("size-4 shrink-0", className)} aria-hidden="true" />
  );
}

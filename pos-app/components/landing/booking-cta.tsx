import Link from "next/link";
import { ArrowRight } from "lucide-react";

const BOOKING_HREF = "/reservation";

interface BookingCtaProps {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "px-4 py-2 text-xs",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

const variantClasses = {
  primary:
    "bg-[#8B1E2D] text-white hover:bg-[#A02435] border border-[#8B1E2D] shadow-lg shadow-[#8B1E2D]/20",
  outline:
    "border border-white/30 text-white hover:bg-white/10 backdrop-blur-sm",
  ghost: "text-[#E8D5C4] hover:text-white underline-offset-4 hover:underline",
};

export function BookingCta({
  variant = "primary",
  size = "md",
  className = "",
  label = "Book a table",
}: BookingCtaProps) {
  return (
    <Link
      href={BOOKING_HREF}
      className={`inline-flex items-center justify-center gap-2 rounded-none font-semibold uppercase tracking-[0.14em] transition-all duration-300 ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {label}
      {variant === "primary" ? <ArrowRight className="h-4 w-4" /> : null}
    </Link>
  );
}

export const RESERVATION_PATH = BOOKING_HREF;

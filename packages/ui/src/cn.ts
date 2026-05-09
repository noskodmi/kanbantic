import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge classnames with conflict resolution for Tailwind utilities.
 *
 * Combines `clsx` (boolean-friendly composition) and `tailwind-merge`
 * (last-wins for conflicting Tailwind classes like `p-2 p-4` -> `p-4`).
 * Use this everywhere a component takes a `className` prop.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

import { clsx, type ClassValue } from "clsx";

/** Class names joiner (no tailwind-merge: components use semantic classes from components.css). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

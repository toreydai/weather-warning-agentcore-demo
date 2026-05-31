import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

/** Parse a YYYY-MM-DD string as local midnight, avoiding UTC offset shifts. */
export function parseLocalDate(s: string): Date {
  return new Date(s + "T00:00:00")
}

/** Recursively flatten a JSON value to a human-readable string. */
export function flattenObj(obj: unknown): string {
  if (typeof obj === "string") return obj
  if (typeof obj === "number") return String(obj)
  if (Array.isArray(obj)) return obj.map(flattenObj).join("；")
  if (typeof obj === "object" && obj !== null)
    return Object.entries(obj).map(([k, v]) => `${k}: ${flattenObj(v)}`).join("；")
  return String(obj)
}

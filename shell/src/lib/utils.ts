import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function isNumber(n: unknown): n is number {
  return typeof n === "number" && !Number.isNaN(n);
}

export function isString(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}
export function isArrayOfStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}
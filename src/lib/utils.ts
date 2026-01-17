import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format MIST to SUI with proper decimal places
 */
export function formatSui(mist: bigint | number, decimals: number = 4): string {
  const value = Number(mist) / 1_000_000_000;
  return `${value.toFixed(decimals)} SUI`;
}

/**
 * Format MIST to SUI number
 */
export function mistToSui(mist: bigint | number): number {
  return Number(mist) / 1_000_000_000;
}

/**
 * Format SUI to MIST
 */
export function suiToMist(sui: number): bigint {
  return BigInt(Math.floor(sui * 1_000_000_000));
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

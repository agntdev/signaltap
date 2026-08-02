import type { Signal } from "./domain.js";

export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-GB", { timeZone: value }); return true; } catch { return false; }
}

export function localTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: validTimezone(timezone) ? timezone : "UTC",
    dateStyle: "medium", timeStyle: "short", hour12: false,
  }).format(new Date(iso));
}

export function signalText(signal: Signal, timezone: string, title = "Trade signal"): string {
  const lines = [
    `${title}: ${signal.asset} ${signal.direction}`,
    `Provider: ${signal.provider}`,
    `Time: ${localTime(signal.timestamp, timezone)} (${validTimezone(timezone) ? timezone : "UTC"})`,
    `Expiry: ${signal.expiry}`,
    `Suggested stake: ${signal.stakeSuggestion}`,
    `Confidence: ${signal.confidence}`,
  ];
  if (signal.details) lines.push(`Details: ${signal.details}`);
  return lines.join("\n");
}

export function storageMessage(): string {
  return "Signal storage isn't set up yet. Please try again after the bot is configured.";
}

import type { NormalizedUsage } from "./types.js";
import type { CostConfig } from "../config/schema.js";

const TOKENS_PER_UNIT = 1_000_000;

export function calcCost(usage: NormalizedUsage, cost: CostConfig | undefined): number {
  if (!cost) return 0;

  const cachedRead = usage.cachedReadTokens ?? 0;
  const cachedWrite = usage.cachedWriteTokens ?? 0;
  const uncachedInput = Math.max(0, usage.inputTokens - cachedRead - cachedWrite);

  const raw =
    uncachedInput * cost.input +
    usage.billingOutputTokens * cost.output +
    cachedRead * cost.cachedRead +
    cachedWrite * cost.cachedWrite;

  return Number(((raw / TOKENS_PER_UNIT)).toFixed(6));
}

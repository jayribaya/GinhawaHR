import { AppError } from "../../common/errors.js";
export type Money = string;
export function cents(value: string): bigint {
  if (!/^-?\d+$/.test(value))
    throw new AppError(422, "INVALID_MONEY", "Money must be integer centavos");
  return BigInt(value);
}
// Round half away from zero; no binary floating point financial operations.
export function ratio(amount: bigint, numerator: bigint, denominator: bigint) {
  if (denominator <= 0n)
    throw new AppError(422, "INVALID_DIVISOR", "Divisor must be positive");
  const value = amount * numerator;
  const sign = value < 0n ? -1n : 1n;
  const absolute = value * sign;
  return sign * ((absolute + denominator / 2n) / denominator);
}
export interface Bracket {
  lower: Money;
  upper: Money | null;
  fixed: Money;
  rateBps: number;
}
export interface Rule {
  kind: "SSS" | "PhilHealth" | "PagIBIG" | "BIR";
  version: string;
  verified: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  baseCeiling?: Money;
  employeeBps?: number;
  employerBps?: number;
  brackets?: Bracket[];
  source: string;
}
export function validateBrackets(brackets: Bracket[]) {
  if (!brackets.length || cents(brackets[0]!.lower) !== 0n)
    throw new AppError(422, "INVALID_TABLE", "Brackets must start at zero");
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i]!;
    if (
      cents(b.fixed) < 0n ||
      !Number.isInteger(b.rateBps) ||
      b.rateBps < 0 ||
      b.rateBps > 10000 ||
      (b.upper !== null && cents(b.upper) <= cents(b.lower))
    )
      throw new AppError(422, "INVALID_TABLE", "Invalid bracket");
    if (
      i < brackets.length - 1 &&
      (b.upper === null || b.upper !== brackets[i + 1]!.lower)
    )
      throw new AppError(422, "INVALID_TABLE", "Brackets must be contiguous");
  }
  if (brackets.at(-1)!.upper !== null)
    throw new AppError(
      422,
      "INVALID_TABLE",
      "Final bracket must be open ended",
    );
}
export function applyRule(base: bigint, rule: Rule) {
  const bounded =
    base < 0n
      ? 0n
      : rule.baseCeiling
        ? base < cents(rule.baseCeiling)
          ? base
          : cents(rule.baseCeiling)
        : base;
  if (rule.brackets) {
    validateBrackets(rule.brackets);
    const bracket = rule.brackets.find(
      (b) =>
        bounded >= cents(b.lower) &&
        (b.upper === null || bounded < cents(b.upper)),
    )!;
    return {
      employee:
        cents(bracket.fixed) +
        ratio(bounded - cents(bracket.lower), BigInt(bracket.rateBps), 10000n),
      employer: 0n,
    };
  }
  return {
    employee: ratio(bounded, BigInt(rule.employeeBps ?? 0), 10000n),
    employer: ratio(bounded, BigInt(rule.employerBps ?? 0), 10000n),
  };
}
export interface PayInput {
  base: Money;
  paidUnits: number;
  periodUnits: number;
  earnings: {
    name: string;
    amount: Money;
    taxable: boolean;
    contributionRelevant: boolean;
  }[];
  deductions: { name: string; amount: Money }[];
}
export function calculate(input: PayInput, rules: Rule[]) {
  if (
    !Number.isInteger(input.paidUnits) ||
    input.paidUnits < 0 ||
    !Number.isInteger(input.periodUnits) ||
    input.periodUnits <= 0 ||
    input.paidUnits > input.periodUnits
  )
    throw new AppError(422, "INVALID_UNITS", "Invalid payable units");
  const base = ratio(
    cents(input.base),
    BigInt(input.paidUnits),
    BigInt(input.periodUnits),
  );
  const gross = base + input.earnings.reduce((s, e) => s + cents(e.amount), 0n);
  const taxable =
    base +
    input.earnings
      .filter((e) => e.taxable)
      .reduce((s, e) => s + cents(e.amount), 0n);
  const contributionBase =
    base +
    input.earnings
      .filter((e) => e.contributionRelevant)
      .reduce((s, e) => s + cents(e.amount), 0n);
  const statutory = rules
    .filter((r) => r.kind !== "BIR")
    .map((r) => ({ kind: r.kind, ...applyRule(contributionBase, r) }));
  const contributions = statutory.reduce((s, r) => s + r.employee, 0n);
  const taxRule = rules.find((r) => r.kind === "BIR");
  const tax = taxRule
    ? applyRule(taxable - contributions, taxRule).employee
    : 0n;
  const deductions = input.deductions.reduce((s, e) => s + cents(e.amount), 0n);
  const net = gross - contributions - tax - deductions;
  return {
    base: base.toString(),
    gross: gross.toString(),
    tax: tax.toString(),
    deductions: deductions.toString(),
    contributions: contributions.toString(),
    net: net.toString(),
    statutory: statutory.map((r) => ({
      kind: r.kind,
      employee: r.employee.toString(),
      employer: r.employer.toString(),
    })),
    exceptions: [
      ...(net < 0n ? ["NEGATIVE_NET_PAY"] : []),
      ...["SSS", "PhilHealth", "PagIBIG", "BIR"]
        .filter((k) => !rules.some((r) => r.kind === k && r.verified))
        .map((k) => `UNVERIFIED_${k}`),
    ],
  };
}
export const transitions: Record<string, string[]> = {
  Draft: ["Calculated"],
  Calculated: ["Under Review"],
  "Under Review": ["Approved", "Rejected"],
  Rejected: ["Calculated"],
  Approved: ["Finalized"],
  Finalized: ["Paid"],
  Paid: [],
  Corrected: [],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to))
    throw new AppError(
      409,
      "INVALID_TRANSITION",
      `Cannot move ${from} to ${to}`,
    );
}

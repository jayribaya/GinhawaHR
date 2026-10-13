import { describe, it, expect } from "vitest";
import {
  calculate,
  ratio,
  cents,
  applyRule,
  assertTransition,
  validateBrackets,
  type Rule,
} from "../src/modules/payroll/domain.js";
import { safeCell, csv } from "../src/modules/reports/csv.js";
import { encrypt, decrypt } from "../src/infrastructure/crypto.js";
import { manilaDay } from "../src/modules/attendance/service.js";
const hypothetical: Rule = {
  kind: "BIR",
  version: "fictional-test-only",
  verified: false,
  effectiveFrom: "2020-01-01",
  source: "fictional test fixture",
  brackets: [
    { lower: "0", upper: "100000", fixed: "0", rateBps: 0 },
    { lower: "100000", upper: null, fixed: "0", rateBps: 1000 },
  ],
};
describe("exact financial arithmetic", () => {
  it("rounds ties away from zero", () => {
    expect(ratio(1n, 1n, 2n)).toBe(1n);
    expect(ratio(-1n, 1n, 2n)).toBe(-1n);
    expect(ratio(100n, 1n, 3n)).toBe(33n);
  });
  it("rejects decimal money and invalid divisors", () => {
    expect(() => cents("1.2")).toThrow();
    expect(() => ratio(1n, 1n, 0n)).toThrow();
  });
  it("handles large centavos beyond number precision", () =>
    expect(cents("900719925474099300")).toBe(900719925474099300n));
  it("computes bracket boundaries using fictional test rules", () => {
    expect(applyRule(99999n, hypothetical).employee).toBe(0n);
    expect(applyRule(100000n, hypothetical).employee).toBe(0n);
    expect(applyRule(100010n, hypothetical).employee).toBe(1n);
  });
  it("rejects gaps and non-open final brackets", () => {
    expect(() =>
      validateBrackets([{ lower: "0", upper: "10", fixed: "0", rateBps: 0 }]),
    ).toThrow();
    expect(() =>
      validateBrackets([
        { lower: "0", upper: "10", fixed: "0", rateBps: 0 },
        { lower: "11", upper: null, fixed: "0", rateBps: 0 },
      ]),
    ).toThrow();
  });
  it("separates taxable and contribution relevant earnings", () => {
    const result = calculate(
      {
        base: "100000",
        paidUnits: 15,
        periodUnits: 30,
        earnings: [
          {
            name: "Reimbursement",
            amount: "10000",
            taxable: false,
            contributionRelevant: false,
          },
        ],
        deductions: [{ name: "Loan", amount: "1000" }],
      },
      [
        {
          ...hypothetical,
          kind: "SSS",
          brackets: undefined,
          employeeBps: 1000,
          employerBps: 2000,
        },
      ],
    );
    expect(result.gross).toBe("60000");
    expect(result.contributions).toBe("5000");
    expect(result.net).toBe("54000");
    expect(result.statutory[0]?.employer).toBe("10000");
    expect(result.exceptions).toContain("UNVERIFIED_SSS");
  });
  it("flags negative net and rejects invalid paid units", () => {
    expect(
      calculate(
        {
          base: "100",
          paidUnits: 1,
          periodUnits: 1,
          earnings: [],
          deductions: [{ name: "Loan", amount: "200" }],
        },
        [],
      ).exceptions,
    ).toContain("NEGATIVE_NET_PAY");
    expect(() =>
      calculate(
        {
          base: "100",
          paidUnits: 2,
          periodUnits: 1,
          earnings: [],
          deductions: [],
        },
        [],
      ),
    ).toThrow();
  });
  it("enforces immutable finalization transitions", () => {
    expect(() => assertTransition("Draft", "Finalized")).toThrow();
    expect(() => assertTransition("Finalized", "Calculated")).toThrow();
    expect(() => assertTransition("Approved", "Finalized")).not.toThrow();
  });
});
describe("security and timestamps", () => {
  it("neutralizes formula cells and quotes CSV", () => {
    expect(safeCell(' =HYPERLINK("x")')).toMatch(/^'/);
    expect(csv([['a"b', "=1+1"]])).toContain('"a""b","\'=1+1"');
  });
  it("authenticates encryption and rejects tampering", () => {
    const key = "ab".repeat(32),
      encrypted = encrypt("fictional identifier", key);
    expect(decrypt(encrypted, key)).toBe("fictional identifier");
    expect(() => decrypt(encrypted.slice(0, -2) + "00", key)).toThrow();
  });
  it("converts UTC to the correct Manila day at midnight", () => {
    expect(manilaDay(new Date("2026-10-12T16:00:00Z"))).toBe("2026-10-13");
    expect(manilaDay(new Date("2026-10-12T15:59:59Z"))).toBe("2026-10-12");
  });
});

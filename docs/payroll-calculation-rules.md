# Payroll calculation and compliance status

**Not ready for production payroll. Finalization is blocked.** The generic preview engine does not implement the complete SSS salary-credit/EC/MPF schedule, all PhilHealth/Pag-IBIG bases, BIR withholding frequency/annualization, minimum wage exemptions, de minimis classification or 13th-month treatment. Uploads are persisted unverified and no verification endpoint exists. Never remove the engine validation exception simply to enable payment.

Financial values use signed integer-centavo strings in MongoDB/API and BigInt in domain code. Ratios round half away from zero, once at the computation step. No JavaScript Number arithmetic calculates currency. Time quantities and basis points are bounded integers. Production rounding points must be approved by the payroll professional and reconciled to official examples.

Preview: salary is loaded effective at cutoff end; monthly/semi-monthly salaries use the configured period divisor, daily basis counts closed attendance days, hourly basis uses recorded minutes. These are explicit preview conventions, not verified legal rules. Unpaid leave, mid-cutoff salary changes, hiring/separation, overtime, holiday pay, overnight allocation and breaks require policy-aware segmentation and currently block or are covered by the universal engine gate. Monthly contributions must not be duplicated by applying a monthly table independently to each semi-monthly run.

Generic brackets are contiguous, lower inclusive and upper exclusive, start at zero and end open. Fixed values are centavos and rates are basis points. Negative net pay is reported as an exception. Statutory employer shares are separate from employee deductions. Tax preview base deducts employee contributions; applicability requires review.

Snapshots include employee display information, salary version, input classifications, attendance, approved leave/overtime, loans, adjustments, period and policy versions. Calculation/recalculation is only permitted from Draft or Rejected. Submission, review and finalization use revisions and transactions. Finalization code reconciles totals and creates payslip/loan repayment records, but cannot currently be reached for a normal calculated run.

## Official source review register

Consulted on 13 October 2026 to identify primary reference locations; **no current rates are installed or certified**. Payroll specialists must verify applicability, later circulars, effective dates and agency-specific reporting requirements for the employer:

- [SSS contribution tables](https://www.sss.gov.ph/sss-contribution-table/) and [SSS circulars](https://www.sss.gov.ph/sss-circulars/).
- [PhilHealth advisories](https://www.philhealth.gov.ph/advisories/) and [2025 premium advisory](https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf), an earlier-year reference rather than a verified current-year policy.
- [Pag-IBIG official website](https://www.pagibigfund.gov.ph/): locate and verify the applicable official circular before importing a table. No Pag-IBIG circular was validated in this increment.
- [BIR Revenue Regulations 11-2018](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2011-2018.pdf) and [BIR withholding calculator](https://web-services.bir.gov.ph/tax_calculator/wt_calculator.html): check subsequent amendments and applicable withholding tables.

Required approval record: official source file/hash, publication date, applicability/effective range, payroll-frequency basis, signed specialist review, dual-control system reviewer, complete positive/boundary/year-end fixtures. Exports are internal reports, not certified government filings.

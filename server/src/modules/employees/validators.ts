import { z } from "zod";
export const id = z.string().regex(/^[a-f\d]{24}$/i);
export const date = z.iso.date();
export const money = z.string().regex(/^\d{1,15}$/);
export const employeeDto = z
  .object({
    employeeNumber: z.string().min(1).max(40),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    email: z.email(),
    phone: z.string().max(40).optional(),
    address: z.string().max(1000).optional(),
    departmentId: id,
    branchId: id,
    positionId: id.optional(),
    managerId: id.optional(),
    status: z
      .enum([
        "Draft",
        "Active",
        "On Leave",
        "Suspended",
        "Separated",
        "Archived",
      ])
      .default("Draft"),
    classification: z.string().max(100).default("Regular"),
    hireDate: date,
    regularizationDate: date.optional(),
    separationDate: date.optional(),
    emergencyContact: z.string().max(300).optional(),
    reason: z.string().min(3).max(500),
    sensitive: z
      .object({
        sss: z.string().max(40).optional(),
        philhealth: z.string().max(40).optional(),
        pagibig: z.string().max(40).optional(),
        tin: z.string().max(40).optional(),
        bankName: z.string().max(100).optional(),
        bankAccount: z.string().max(50).optional(),
      })
      .optional(),
  })
  .strict()
  .refine((d) => !d.regularizationDate || d.regularizationDate >= d.hireDate, {
    message: "Regularization cannot precede hiring",
  })
  .refine((d) => !d.separationDate || d.separationDate >= d.hireDate, {
    message: "Separation cannot precede hiring",
  })
  .refine((d) => d.status !== "Separated" || Boolean(d.separationDate), {
    message: "Separated employees require a separation date",
  });

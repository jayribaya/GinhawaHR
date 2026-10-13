import type { FilterQuery } from 'mongoose';
import { deny } from '../../common/errors.js';
export const permissions=['employees.read','employees.write','compensation.read','compensation.write','organization.read','organization.write','attendance.read','attendance.write','attendance.approve','leave.read','leave.write','leave.approve','overtime.read','overtime.write','overtime.approve','payroll.read','payroll.prepare','payroll.approve','payroll.finalize','payslips.read','payslips.release','loans.read','loans.write','payments.read','payments.write','payments.approve','reports.read','settings.read','settings.write','roles.read','roles.write','audit.read','users.read','users.write','statutory.read','statutory.write'] as const;
export type Permission=typeof permissions[number];
export interface Principal{userId:string;companyId:string;employeeId?:string;departmentIds:string[];scope:'company'|'department'|'self';permissions:string[];}
export const defaults:Record<string,{permissions:string[];scope:Principal['scope']}>= {
 'Super Administrator':{permissions:[...permissions],scope:'company'},
 'HR Administrator':{permissions:permissions.filter(p=>/^(employees|organization|attendance|leave|overtime|users)\./.test(p)),scope:'company'},
 'Payroll Administrator':{permissions:['employees.read','compensation.read','compensation.write','attendance.read','leave.read','payroll.read','payroll.prepare','payslips.read','payslips.release','loans.read','loans.write','payments.read','payments.write','reports.read','statutory.read','statutory.write'],scope:'company'},
 'Payroll Approver':{permissions:['payroll.read','payroll.approve','payroll.finalize','payments.read','payments.approve','reports.read'],scope:'company'},
 'Department Manager':{permissions:['employees.read','attendance.read','attendance.approve','leave.read','leave.approve','overtime.read','overtime.approve'],scope:'department'},
 'Employee':{permissions:['employees.read','attendance.read','attendance.write','leave.read','leave.write','overtime.read','overtime.write','payslips.read','payroll.read'],scope:'self'},
 'Auditor':{permissions:['employees.read','payroll.read','reports.read','audit.read','statutory.read'],scope:'company'}
};
export function requirePermission(actor:Principal,key:string){if(!actor.permissions.includes(key))throw deny();}
export function employeeFilter(actor:Principal):FilterQuery<unknown>{if(actor.scope==='company')return {companyId:actor.companyId};if(actor.scope==='department')return {companyId:actor.companyId,departmentId:{$in:actor.departmentIds}};return {companyId:actor.companyId,_id:actor.employeeId??null};}

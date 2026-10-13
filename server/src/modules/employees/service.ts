import mongoose from 'mongoose';
import {Department,Branch,Position,Employee,EmploymentHistory,SalaryHistory} from '../../infrastructure/models.js';
import {employeeDto,id,date,money} from './validators.js';
import {findEmployee} from './repository.js';
import {requirePermission,type Principal} from '../roles/policy.js';
import {encrypt} from '../../infrastructure/crypto.js';
import {audit} from '../../infrastructure/audit.js';
import {AppError,deny} from '../../common/errors.js';
import {z} from 'zod';
export class EmployeeService{
 constructor(private encryptionKey:string){}
 async save(actor:Principal,body:unknown,correlationId:string,employeeId?:string){requirePermission(actor,'employees.write');if(actor.scope!=='company')throw deny();const data=employeeDto.parse(body);for(const [model,reference] of [[Department,data.departmentId],[Branch,data.branchId],[Position,data.positionId]] as const){if(reference&&!await model.exists({_id:reference,companyId:actor.companyId}))throw new AppError(422,'INVALID_REFERENCE','Organization reference does not exist');}if(data.managerId)await findEmployee(actor,data.managerId);return mongoose.connection.transaction(async session=>{const existing=employeeId?await findEmployee(actor,id.parse(employeeId),session):undefined;const {sensitive,reason,...plain}=data;const update={...plain,...(sensitive?{sensitive:encrypt(JSON.stringify(sensitive),this.encryptionKey),bankLast4:sensitive.bankAccount?.slice(-4)}:{})};const record=existing?Object.assign(existing,update):new Employee({...update,companyId:actor.companyId});await record.save({session});await EmploymentHistory.create([{companyId:actor.companyId,employeeId:record.id,departmentId:record.departmentId,branchId:record.branchId,positionId:record.positionId,status:record.status,effectiveDate:new Date(),reason,actorId:actor.userId}],{session});await audit(actor,existing?'employee.update':'employee.create',record.id,correlationId,reason,session);return record;});}
 async salary(actor:Principal,employeeId:string,body:unknown,correlationId:string){requirePermission(actor,'compensation.write');const employee=await findEmployee(actor,id.parse(employeeId));const data=z.object({amount:money,basis:z.enum(['monthly','semi-monthly','daily','hourly']),effectiveDate:date,reason:z.string().min(3).max(500)}).strict().parse(body);return mongoose.connection.transaction(async session=>{const [result]=await SalaryHistory.create([{...data,companyId:actor.companyId,employeeId,departmentId:employee.departmentId,actorId:actor.userId}],{session});await audit(actor,'compensation.create',employeeId,correlationId,data.reason,session);return result;});}
}

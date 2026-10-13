import {Employee} from '../../infrastructure/models.js';
import {employeeFilter,type Principal} from '../roles/policy.js';
import {AppError} from '../../common/errors.js';
export async function findEmployee(actor:Principal,id:string,session?:import('mongoose').ClientSession){const employee=await Employee.findOne({...employeeFilter(actor),_id:id}).session(session??null);if(!employee)throw new AppError(404,'NOT_FOUND','Record not found');return employee;}

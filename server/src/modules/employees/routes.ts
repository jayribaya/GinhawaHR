import {Router} from 'express';
import {z} from 'zod';
import {handler,ok} from '../../common/http.js';
import {Employee,SalaryHistory,EmploymentHistory} from '../../infrastructure/models.js';
import {requirePermission,employeeFilter} from '../roles/policy.js';
import {findEmployee} from './repository.js';
import {id} from './validators.js';
import {EmployeeService} from './service.js';
export function employeeRoutes(service:EmployeeService){const router=Router();
 router.get('/',handler(async(req,res)=>{requirePermission(req.actor,'employees.read');const page=z.coerce.number().int().min(1).default(1).parse(req.query.page);const limit=z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit);const q=z.string().max(100).default('').parse(req.query.q);const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const filter={...employeeFilter(req.actor),...(q?{$or:[{firstName:{$regex:escaped,$options:'i'}},{lastName:{$regex:escaped,$options:'i'}},{employeeNumber:{$regex:escaped,$options:'i'}}]}:{}),...(req.query.status?{status:z.enum(['Draft','Active','On Leave','Suspended','Separated','Archived']).parse(req.query.status)}:{})};const [data,total]=await Promise.all([Employee.find(filter).sort({lastName:1,_id:1}).skip((page-1)*limit).limit(limit).populate('departmentId','name').populate('branchId','name'),Employee.countDocuments(filter)]);ok(res,data,{page,limit,total});}));
 router.post('/',handler(async(req,res)=>ok(res.status(201),await service.save(req.actor,req.body,req.correlationId))));
 router.get('/:id',handler(async(req,res)=>{requirePermission(req.actor,'employees.read');ok(res,await findEmployee(req.actor,id.parse(req.params.id)));}));
 router.put('/:id',handler(async(req,res)=>ok(res,await service.save(req.actor,req.body,req.correlationId,String(req.params.id)))));
 router.get('/:id/history',handler(async(req,res)=>{requirePermission(req.actor,'employees.read');await findEmployee(req.actor,id.parse(req.params.id));ok(res,await EmploymentHistory.find({companyId:req.actor.companyId,employeeId:req.params.id}).sort({effectiveDate:-1}));}));
 router.get('/:id/salaries',handler(async(req,res)=>{requirePermission(req.actor,'compensation.read');await findEmployee(req.actor,id.parse(req.params.id));ok(res,await SalaryHistory.find({companyId:req.actor.companyId,employeeId:req.params.id}).sort({effectiveDate:-1}));}));
 router.post('/:id/salaries',handler(async(req,res)=>ok(res.status(201),await service.salary(req.actor,String(req.params.id),req.body,req.correlationId))));return router;
}

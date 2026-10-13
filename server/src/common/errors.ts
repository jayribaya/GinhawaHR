export class AppError extends Error{constructor(public status:number,public code:string,message:string){super(message);}}
export const deny=()=>new AppError(403,'FORBIDDEN','This action is not permitted.');

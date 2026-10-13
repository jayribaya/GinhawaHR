import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
export function encrypt(value:string,key:string){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),data.toString('hex')].join(':');}
export function decrypt(value:string,key:string){const [iv,tag,data]=value.split(':');if(!iv||!tag||!data)throw new Error('Invalid ciphertext');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));cipher.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8');}

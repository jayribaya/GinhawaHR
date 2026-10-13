import * as React from 'react';
import {Slot} from '@radix-ui/react-slot';
import {cn} from '../../lib/utils';
export function Button({className,variant='default',asChild=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'default'|'outline'|'ghost'|'danger';asChild?:boolean}){const Comp=asChild?Slot:'button';return <Comp className={cn('button',variant,className)} {...props}/>;}

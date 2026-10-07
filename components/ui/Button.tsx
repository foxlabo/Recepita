'use client';
import { cn } from '@/lib/cn';
import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary'|'outline'|'ghost';
  size?: 'sm'|'md'|'lg';
  asChild?: boolean;
};

export default function Button({ className, variant='primary', size='md', asChild, ...rest }: Props){
  const base = 'inline-flex items-center justify-center font-medium rounded-md transition-colors';
  const styles = {
    primary: 'bg-recepita hover:bg-recepita-dark text-white',
    outline: 'border border-(--border) bg-(--card) hover:bg-gray-50 text-(--fg) dark:hover:bg-[#101a16]',
    ghost:   'hover:bg-gray-100 dark:hover:bg-[#101a16]',
  }[variant];
  const sizes = {
    sm:'px-2.5 py-1.5 text-sm',
    md:'px-3.5 py-2',
    lg:'px-4.5 py-2.5 text-lg',
  }[size];

  if(asChild){
    // naive asChild: expect child anchor
    // @ts-ignore
    const { children, ...props } = rest;
    return React.cloneElement(children as any, { className: cn(base, styles, sizes, className), ...props });
  }
  return <button className={cn(base, styles, sizes, className)} {...rest} />;
}

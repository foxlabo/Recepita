'use client';
import { type ButtonHTMLAttributes, cloneElement, type ReactElement } from 'react';
import { cn } from '@/lib/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
};

/**
 * `type` defaults to "button" instead of the HTML default "submit", so a
 * Button inside a <form> never submits it by accident. Submit buttons pass
 * type="submit" explicitly.
 */
export default function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild,
  type = 'button',
  ...rest
}: Props) {
  const base = 'inline-flex items-center justify-center font-medium rounded-md transition-colors';
  const styles = {
    primary: 'bg-recepita hover:bg-recepita-dark text-white',
    outline: 'border border-(--border) bg-(--card) hover:bg-gray-50 text-(--fg) dark:hover:bg-[#101a16]',
    ghost: 'hover:bg-gray-100 dark:hover:bg-[#101a16]',
  }[variant];
  const sizes = {
    sm: 'px-2.5 py-1.5 text-sm',
    md: 'px-3.5 py-2',
    lg: 'px-4.5 py-2.5 text-lg',
  }[size];

  if (asChild) {
    // naive asChild: the single child element (e.g. an <a>) gets the styles
    const { children, ...props } = rest;
    return cloneElement(children as ReactElement<Record<string, unknown>>, {
      className: cn(base, styles, sizes, className),
      ...props,
    });
  }
  return <button type={type} className={cn(base, styles, sizes, className)} {...rest} />;
}

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'surface' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'icon'

type NativeButton = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onDrag' | 'onDragStart' | 'onDragEnd'
>

interface Props extends NativeButton {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-[#04150e] font-semibold hover:brightness-110 shadow-[0_6px_20px_-8px_rgba(110,231,183,0.6)]',
  danger:
    'bg-danger/90 text-white font-semibold hover:bg-danger shadow-[0_6px_20px_-8px_rgba(255,77,79,0.6)]',
  surface:
    'bg-surface-2 text-fg hover:bg-surface-3 border border-border',
  outline:
    'bg-transparent text-fg-muted hover:text-fg border border-border hover:border-fg-faint',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'surface', size = 'md', children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  )
})

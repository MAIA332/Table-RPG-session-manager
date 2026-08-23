import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'border-primary/70 bg-gradient-to-b from-accent to-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_5px_12px_rgba(0,0,0,0.24)] hover:border-accent hover:brightness-110',
        outline:
          'border-border bg-background/45 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-primary/70 hover:bg-primary/10 hover:text-accent aria-expanded:border-primary/70 aria-expanded:bg-primary/10',
        secondary:
          'border-border/60 bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-primary/50 hover:bg-secondary/80 aria-expanded:bg-secondary',
        ghost:
          'text-muted-foreground hover:bg-primary/10 hover:text-accent aria-expanded:bg-primary/10 aria-expanded:text-accent',
        destructive:
          'border-destructive/50 bg-destructive/15 text-red-300 hover:border-destructive hover:bg-destructive hover:text-white focus-visible:border-destructive focus-visible:ring-destructive/25',
        magical:
          'border-[#71869e]/60 bg-gradient-to-b from-[#526a82] to-[#334657] text-[#f1e8d6] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_5px_14px_rgba(0,0,0,0.24)] hover:border-[#91a8c0] hover:brightness-110',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-8',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const customTone = typeof className === 'string' && /(?:bg-destructive|text-destructive|bg-blue-|bg-zinc-|rpg-weather-button)/.test(className)
  const themePrimary = variant === 'default' && !customTone

  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-theme-primary={themePrimary ? 'true' : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

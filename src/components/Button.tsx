import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import styles from './Button.module.css'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  highlight?: boolean
  ref?: Ref<HTMLButtonElement>
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  highlight,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    highlight && styles.highlight,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'xl' ? 26 : size === 'sm' ? 16 : 18} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: string
  small?: boolean
  active?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({ icon, label, small, active, className, type = 'button', ...rest }: IconButtonProps) {
  const classes = [styles.icon, small && styles.iconSm, active && styles.iconActive, className].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={small ? 16 : 20} />
    </button>
  )
}

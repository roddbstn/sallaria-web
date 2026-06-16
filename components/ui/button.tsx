import { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost'
  fullWidth?: boolean
}

export default function Button({
  variant = 'primary',
  fullWidth = true,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base = fullWidth ? 'w-full' : ''

  const variants = {
    primary: [
      'py-[17px] bg-[#1E1E1E] text-white rounded-xl text-base font-bold',
      'disabled:bg-[#CCC] disabled:cursor-not-allowed disabled:active:scale-100',
      'transition-colors',
    ].join(' '),
    ghost: [
      'py-[17px] border border-[#D7D7D7] text-[#1E1E1E] rounded-xl text-base font-semibold bg-transparent',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
    ].join(' '),
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

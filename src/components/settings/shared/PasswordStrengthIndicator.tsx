interface PasswordStrengthIndicatorProps {
  password: string
}

interface PasswordStrength {
  label: string
  color: string
  width: string
}

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { label: '', color: '', width: '0%' }
  if (password.length < 8) return { label: 'Too short', color: 'var(--color-error)', width: '25%' }
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSpecial = /[^a-zA-Z0-9]/.test(password)
  const score = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length
  if (score <= 1) return { label: 'Weak', color: 'var(--color-warning)', width: '33%' }
  if (score <= 2) return { label: 'Fair', color: 'var(--color-warning)', width: '50%' }
  if (score <= 3) return { label: 'Good', color: 'var(--color-success)', width: '75%' }
  return { label: 'Strong', color: 'var(--color-success)', width: '100%' }
}

/**
 * Visual password strength indicator with progress bar.
 */
export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  const strength = getPasswordStrength(password)

  if (password.length === 0) return null

  return (
    <div className="mt-1.5 px-1">
      <div className="h-1 w-full bg-[var(--color-surface-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{ width: strength.width, backgroundColor: strength.color }}
        />
      </div>
      <p className="text-[10px] mt-0.5" style={{ color: strength.color }}>
        {strength.label}
      </p>
    </div>
  )
}

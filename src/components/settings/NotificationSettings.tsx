import { useSettingsStore } from '../../stores/settingsStore'
import { config } from '../../provider'

export function NotificationSettings() {
  const {
    notifications,
    theme,
    setNotificationsEnabled,
    setNotificationSound,
    setShowPreview,
    setTheme
  } = useSettingsStore()

  return (
    <div className="p-6 bg-white rounded-xl border border-gray-200 space-y-6">
      <h2 className="text-lg font-medium text-black">Settings</h2>

      {/* Notifications section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Notifications
        </h3>

        <ToggleSetting
          label="Enable notifications"
          description="Show desktop notifications for new messages"
          enabled={notifications.enabled}
          onChange={setNotificationsEnabled}
        />

        <ToggleSetting
          label="Notification sound"
          description="Play a sound when new messages arrive"
          enabled={notifications.sound}
          onChange={setNotificationSound}
          disabled={!notifications.enabled}
        />

        <ToggleSetting
          label="Show message preview"
          description="Show message content in notifications"
          enabled={notifications.showPreview}
          onChange={setShowPreview}
          disabled={!notifications.enabled}
        />
      </div>

      {/* Theme section */}
      <div className="space-y-4 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Appearance
        </h3>

        <div className="space-y-2">
          <label className="text-sm text-gray-600">Theme</label>
          <div className="flex space-x-2">
            <ThemeButton
              label="Dark"
              value="dark"
              current={theme}
              onChange={setTheme}
            />
            <ThemeButton
              label="Light"
              value="light"
              current={theme}
              onChange={setTheme}
            />
            <ThemeButton
              label="System"
              value="system"
              current={theme}
              onChange={setTheme}
            />
          </div>
        </div>
      </div>

      {/* About section */}
      <div className="space-y-2 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          About
        </h3>
        <p className="text-sm text-gray-500">
          {config.name} Chat uses end-to-end encryption powered by the XMTP network.
          Your messages are encrypted and can only be read by you and your conversation partners.
        </p>
        <div className="flex space-x-4 text-sm">
          <a
            href="https://xmtp.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            Learn about XMTP
          </a>
          <a
            href="https://bsky.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            {config.name}
          </a>
        </div>
      </div>
    </div>
  )
}

interface ToggleSettingProps {
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

function ToggleSetting({ label, description, enabled, onChange, disabled }: ToggleSettingProps) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className="text-sm font-medium text-black">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          enabled ? 'bg-blue-500' : 'bg-gray-300'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

interface ThemeButtonProps {
  label: string
  value: 'light' | 'dark' | 'system'
  current: string
  onChange: (theme: 'light' | 'dark' | 'system') => void
}

function ThemeButton({ label, value, current, onChange }: ThemeButtonProps) {
  const isActive = current === value

  return (
    <button
      onClick={() => onChange(value)}
      className={`flex-1 py-2 px-4 rounded-full text-sm font-medium transition-colors ${
        isActive
          ? 'bg-blue-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

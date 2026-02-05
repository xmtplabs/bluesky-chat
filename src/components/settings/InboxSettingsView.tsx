import * as Settings from './Settings'

export function InboxSettingsView() {
  return (
    <Settings.Provider>
      <div className="h-full flex flex-col min-h-0">
        <Settings.Header />
        <div className="flex-1 min-h-0 overflow-y-auto pl-4 pr-1 py-4 space-y-4" style={{ scrollbarGutter: 'stable' }}>
          <Settings.MessageBanner />
          <Settings.IdentityStatus />
          <Settings.InboxId />
          <Settings.KeyManagement />
          <Settings.UpdateStatus />
          <Settings.DevTools />
        </div>
        <Settings.Footer />
      </div>
    </Settings.Provider>
  )
}

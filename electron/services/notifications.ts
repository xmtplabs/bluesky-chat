import { Notification, app } from 'electron'

export class NotificationService {
  private enabled = true
  private sound = true
  private showPreview = true

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setSound(sound: boolean): void {
    this.sound = sound
  }

  setShowPreview(showPreview: boolean): void {
    this.showPreview = showPreview
  }

  show(title: string, body: string, onClick?: () => void): void {
    if (!this.enabled || !Notification.isSupported()) {
      return
    }

    const notification = new Notification({
      title,
      body: this.showPreview ? body : 'New message',
      silent: !this.sound
    })

    if (onClick) {
      notification.on('click', onClick)
    }

    notification.show()
  }

  setBadgeCount(count: number): void {
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '')
    }
  }
}

export const notificationService = new NotificationService()

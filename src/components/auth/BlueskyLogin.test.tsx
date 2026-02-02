import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BlueskyLogin } from './BlueskyLogin'

// Mock the useBluesky hook
const mockLogin = vi.fn()
const mockLoginWithPassword = vi.fn()

vi.mock('../../hooks/useBluesky', () => ({
  useBluesky: () => ({
    login: mockLogin,
    loginWithPassword: mockLoginWithPassword,
    isLoading: false,
    authError: null
  })
}))

describe('BlueskyLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render login form with OAuth as primary', () => {
    render(<BlueskyLogin />)

    expect(screen.getByText('Bluesky Chat')).toBeInTheDocument()
    expect(screen.getByText(/Private group chats and DMs for Bluesky/)).toBeInTheDocument()
    expect(screen.getByText(/Secured by XMTP/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Bluesky' })).toBeInTheDocument()
  })

  it('should show OAuth form by default (not password form)', () => {
    render(<BlueskyLogin />)

    // OAuth mode shows "Bluesky Username" label and .bsky.social suffix
    expect(screen.getByLabelText('Bluesky Username')).toBeInTheDocument()
    expect(screen.getByText('.bsky.social')).toBeInTheDocument()

    // Password field should NOT be visible by default
    expect(screen.queryByLabelText('App Password')).not.toBeInTheDocument()
  })

  it('should show password form when clicking "Use App Password instead"', () => {
    render(<BlueskyLogin />)

    const switchButton = screen.getByRole('button', { name: 'Use App Password instead' })
    fireEvent.click(switchButton)

    // Now password form should be visible
    expect(screen.getByLabelText('App Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Handle or Email')).toBeInTheDocument()

    // OAuth elements should be hidden
    expect(screen.queryByText('.bsky.social')).not.toBeInTheDocument()
  })

  it('should call login on OAuth form submit', async () => {
    render(<BlueskyLogin />)

    const identifierInput = screen.getByLabelText('Bluesky Username')
    const submitButton = screen.getByRole('button', { name: 'Sign in with Bluesky' })

    fireEvent.change(identifierInput, { target: { value: 'testhandle' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testhandle')
    })
  })

  it('should call loginWithPassword on password form submit', async () => {
    render(<BlueskyLogin />)

    // Switch to password mode
    const switchButton = screen.getByRole('button', { name: 'Use App Password instead' })
    fireEvent.click(switchButton)

    const identifierInput = screen.getByLabelText('Handle or Email')
    const passwordInput = screen.getByLabelText('App Password')
    const submitButton = screen.getByRole('button', { name: 'Sign In' })

    fireEvent.change(identifierInput, { target: { value: 'test.bsky.social' } })
    fireEvent.change(passwordInput, { target: { value: 'test-password' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockLoginWithPassword).toHaveBeenCalledWith('test.bsky.social', 'test-password')
    })
  })

  it('should switch back to OAuth from password form', () => {
    render(<BlueskyLogin />)

    // Switch to password mode
    fireEvent.click(screen.getByRole('button', { name: 'Use App Password instead' }))
    expect(screen.getByLabelText('App Password')).toBeInTheDocument()

    // Switch back to OAuth mode
    fireEvent.click(screen.getByRole('button', { name: 'Back to OAuth sign in' }))
    expect(screen.queryByLabelText('App Password')).not.toBeInTheDocument()
    expect(screen.getByText('.bsky.social')).toBeInTheDocument()
  })

  it('should show link to create app password in password mode', () => {
    render(<BlueskyLogin />)

    // Switch to password mode
    fireEvent.click(screen.getByRole('button', { name: 'Use App Password instead' }))

    const link = screen.getByRole('link', { name: /bsky.app\/settings\/app-passwords/ })
    expect(link).toHaveAttribute('href', 'https://bsky.app/settings/app-passwords')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('should show encryption notice in footer', () => {
    render(<BlueskyLogin />)

    expect(screen.getByText(/End-to-end encrypted/)).toBeInTheDocument()
    expect(screen.getByText(/Secured by XMTP/)).toBeInTheDocument()
  })
})

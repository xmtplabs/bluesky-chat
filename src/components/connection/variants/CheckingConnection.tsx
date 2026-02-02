/**
 * Displayed while checking for existing XMTP identity key.
 */
export function CheckingConnection() {
  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007AFF] mx-auto" />
        <p className="mt-4 text-black font-medium">Checking for existing identity...</p>
        <p className="mt-2 text-[#666] text-sm">
          This only takes a moment
        </p>
      </div>
    </div>
  )
}

export type ScreenProps = {
  uid: string
  active: boolean
  onExit: () => void
  onNavigate?: (tab: string, context?: string | null) => void
  navContext?: string | null
}

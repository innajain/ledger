/** Props every screen receives from App. `active` = this screen owns the keyboard. */
export type ScreenProps = {
  uid: string
  active: boolean
  onExit: () => void
  onNavigate?: (tab: string, context?: string | null) => void
  navContext?: string | null
}

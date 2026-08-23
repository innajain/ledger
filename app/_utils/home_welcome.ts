// The home page greeting. Picked on the server (the page is dynamic — it reads the auth
// cookie — so Math.random() there gives a fresh quip per request) and passed to the client
// as a prop, which is what keeps it from painting one message and swapping to another.
//
// Kept deliberately small, calm, and emoji-free: this is the first line of copy on every
// visit, and it should read like the app, not like a fortune cookie.
export const WELCOME_MESSAGES = [
  'Welcome back.',
  'Your ledger, up to date.',
  'The books are balanced and waiting.',
  'Everything reconciled is locked; everything else is a click away.',
]

export function pick_welcome_message(random: number = Math.random()): string {
  const index = Math.floor(random * WELCOME_MESSAGES.length)
  const clamped = Math.min(Math.max(index, 0), WELCOME_MESSAGES.length - 1)
  return WELCOME_MESSAGES[clamped]
}

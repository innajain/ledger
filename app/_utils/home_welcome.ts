// The home page greeting. Picked on the server (the page is dynamic — it reads the auth
// cookie — so Math.random() there gives a fresh quip per request) and passed to the client
// as a prop, which is what keeps it from painting one message and swapping to another.
export const WELCOME_MESSAGES = [
  "Welcome back! Your wallet misses you (but your bank doesn't). 🦘",
  "Hello! Today's forecast: 100% chance of spreadsheets. 📊",
  "Welcome to Ledger! Let's make your money do the cha-cha. 💃",
  'Hey! Time to check your finances (and maybe cry a little). 😅',
  "Welcome back, money magician! Abracadabra, where'd it go? 🪄",
  'Ready to conquer your budget? The numbers await! 🏆',
  'Ledger loaded. Time to track those coins! 🪙',
  "Your financial sidekick is here. Let's get started! 🦸‍♂️",
  'Welcome! May your balances always be positive. ➕',
  "Money talks. Ledger listens. Let's see what it says! 🗣️",
  'Back again? Your assets are happy to see you! 😃',
  "Let's make cents of your finances together. 🧩",
  "Welcome! Today's goal: less spending, more saving. 💰",
  "Ledger says: You're richer than you think! 🤑",
  'Time to check your treasure chest. 🏴‍☠️',
  "Congrats on logging in. That's probably the most productive thing you'll do today. 👏",
  "Your net worth: technically a number. Emotionally: let's not go there. 📉",
  'Still here? Impressive. Most people quit after seeing their spending. 🫡',
  "Welcome back. Your money didn't grow while you were gone. Just checking. 🌵",
  "Ah, another visit. Hoping the numbers magically changed? Spoiler: they didn't. 🔮",
  'Good news: you opened Ledger. Bad news: you still have to look at it. 😬',
  'Welcome! Your future self called. They said stop spending. 📞',
  "Remember: every ₹ you waste is a ₹ your investments didn't get. You're welcome. 😇",
  "Back again to financially gaslight yourself? Let's go! 🎢",
  "Logging in won't fix your finances. But not logging in won't either. Here we are. 🤷",
  'Your accountant would be proud. Or horrified. Hard to say without looking. 👀',
  "The stock market is down, your spending is up, and you're somehow still here. Respect. 💀",
  'Welcome! Did you know you could have invested the money you spent on that last thing? No? Now you do. 🧾',
  "Budgeting: the art of feeling guilty about fun things and proud of boring ones. Let's begin. 🎭",
  "Hello! The only number that matters is net worth. Unless it's negative. Then we don't talk about it. 🤐",
]

export function pick_welcome_message(random: number = Math.random()): string {
  const index = Math.floor(random * WELCOME_MESSAGES.length)
  const clamped = Math.min(Math.max(index, 0), WELCOME_MESSAGES.length - 1)
  return WELCOME_MESSAGES[clamped]
}

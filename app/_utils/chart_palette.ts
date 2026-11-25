// Chart colours on the paper palette. Chart libraries take literal colours rather than
// CSS classes, so these mirror the tokens in globals.css — keep the two in step.
// Dependency-free: imported by client chart components.

export type ChartPalette = {
  text: string
  grid: string
  invested: string
  current: string
  xirr: string
  tooltip_bg: string
  tooltip_border: string
  tooltip_text: string
  tooltip_muted: string
}

const LIGHT: ChartPalette = {
  text: '#6f6757', // ink-3
  grid: '#ded6c4', // rule
  invested: '#6f6757', // ink-3: what went in is the quiet line
  current: '#1d5b45', // accent: what it is worth now is the one to read
  xirr: '#8a5a12', // warn (ochre)
  tooltip_bg: '#fbf9f4', // raised
  tooltip_border: '#c4b9a3', // rule-strong
  tooltip_text: '#22201b', // ink
  tooltip_muted: '#6f6757', // ink-3
}

const DARK: ChartPalette = {
  text: '#9a9182',
  grid: '#34302a',
  invested: '#9a9182',
  current: '#86c7a8',
  xirr: '#d9a55b',
  tooltip_bg: '#221f1a',
  tooltip_border: '#4a443a',
  tooltip_text: '#ece6d8',
  tooltip_muted: '#9a9182',
}

export function chart_palette(is_dark: boolean): ChartPalette {
  return is_dark ? DARK : LIGHT
}

/** `#rrggbb` at an alpha, for the fills under an area line. */
export function with_alpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

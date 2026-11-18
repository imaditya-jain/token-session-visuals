/**
 * Email-safe equivalents of the locked design tokens (src/styles.css). Email clients ignore OKLCH and web
 * fonts, so colours are exact sRGB conversions and fonts are the closest safe stacks (Georgia for Fraunces).
 */
export const brand = {
  cream: "#faf3e5",
  card: "#fdfaf4",
  sand: "#efe3cb",
  forest: "#314329",
  forestDeep: "#1a2c16",
  clay: "#bf623d",
  clayDeep: "#9a4729",
  sage: "#9bab8a",
  sageLight: "#e1e0c6",
  text: "#25321e",
  muted: "#59614c",
  border: "#ddd4bb",
  display: "Georgia, 'Times New Roman', serif",
  body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
} as const;

export const company = {
  name: "Fernwood",
  address: "1234 Greenhouse Lane, Portland, OR 97210",
  supportEmail: "hello@fernwood.shop",
} as const;

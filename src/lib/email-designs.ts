/**
 * The email design catalogue: 12 layouts x 9 palettes = 108 designs. A design is a layout (how the message is
 * arranged) in a palette (colours). Every colour is one of the site's own tokens (see server/email/templates/brand.ts),
 * so every design is on-brand. Pure data: the admin picker and the renderer share it.
 */
export type Palette = {
  id: string;
  name: string;
  /** Page background behind the message. */
  page: string;
  /** The message surface. */
  card: string;
  /** Colour of the header band, when a layout has one. */
  band: string;
  bandText: string;
  heading: string;
  text: string;
  muted: string;
  accent: string;
  button: string;
  buttonText: string;
  border: string;
};

const T = {
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
} as const;

export const PALETTES: readonly Palette[] = [
  {
    id: "classic",
    name: "Classic",
    page: T.cream,
    card: T.card,
    band: T.forest,
    bandText: T.cream,
    heading: T.forest,
    text: T.text,
    muted: T.muted,
    accent: T.clay,
    button: T.forest,
    buttonText: T.cream,
    border: T.border,
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    page: T.cream,
    card: T.card,
    band: T.forest,
    bandText: T.cream,
    heading: T.forest,
    text: T.text,
    muted: T.muted,
    accent: T.sage,
    button: T.clay,
    buttonText: T.cream,
    border: T.border,
  },
  {
    id: "terracotta",
    name: "Terracotta",
    page: T.sand,
    card: T.card,
    band: T.clay,
    bandText: T.cream,
    heading: T.clayDeep,
    text: T.text,
    muted: T.muted,
    accent: T.clay,
    button: T.clayDeep,
    buttonText: T.cream,
    border: T.border,
  },
  {
    id: "sage",
    name: "Sage",
    page: T.sageLight,
    card: T.card,
    band: T.sage,
    bandText: T.forestDeep,
    heading: T.forest,
    text: T.text,
    muted: T.muted,
    accent: T.forest,
    button: T.forest,
    buttonText: T.cream,
    border: T.sage,
  },
  {
    id: "sand",
    name: "Sand",
    page: T.sand,
    card: T.cream,
    band: T.sand,
    bandText: T.forest,
    heading: T.forest,
    text: T.text,
    muted: T.muted,
    accent: T.clay,
    button: T.forestDeep,
    buttonText: T.cream,
    border: T.border,
  },
  {
    id: "evergreen",
    name: "Evergreen",
    page: T.forestDeep,
    card: T.forest,
    band: T.forestDeep,
    bandText: T.cream,
    heading: T.cream,
    text: T.sageLight,
    muted: T.sage,
    accent: T.clay,
    button: T.clay,
    buttonText: T.cream,
    border: T.forestDeep,
  },
  {
    id: "kiln",
    name: "Kiln",
    page: T.clayDeep,
    card: T.clay,
    band: T.clayDeep,
    bandText: T.cream,
    heading: T.cream,
    text: T.cream,
    muted: T.sageLight,
    accent: T.sageLight,
    button: T.cream,
    buttonText: T.clayDeep,
    border: T.clayDeep,
  },
  {
    id: "paper",
    name: "Paper",
    page: T.card,
    card: T.card,
    band: T.card,
    bandText: T.forest,
    heading: T.forestDeep,
    text: T.text,
    muted: T.muted,
    accent: T.clay,
    button: T.forestDeep,
    buttonText: T.cream,
    border: T.border,
  },
  {
    id: "meadow",
    name: "Meadow",
    page: T.sageLight,
    card: T.cream,
    band: T.forest,
    bandText: T.sageLight,
    heading: T.forest,
    text: T.text,
    muted: T.muted,
    accent: T.clayDeep,
    button: T.clayDeep,
    buttonText: T.cream,
    border: T.sage,
  },
];

export type Layout = { id: string; name: string; description: string };

export const LAYOUTS: readonly Layout[] = [
  {
    id: "card",
    name: "Card",
    description: "A framed card on the page colour with the wordmark above.",
  },
  {
    id: "banner",
    name: "Banner",
    description: "A coloured band across the top carries the wordmark.",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Left-aligned, open page, big serif heading, no frame.",
  },
  {
    id: "centered",
    name: "Centred",
    description: "Everything centred, generous space, a single column.",
  },
  { id: "hero", name: "Hero picture", description: "A wide picture first, then the message." },
  {
    id: "feature",
    name: "Feature block",
    description: "The heading sits in a coloured block, the text below.",
  },
  {
    id: "letter",
    name: "Letter",
    description: "A personal note with a ruled edge and a sign-off.",
  },
  {
    id: "promo",
    name: "Promotion",
    description: "Small badge, big heading and a full-width button.",
  },
  { id: "framed", name: "Framed", description: "A double border around the whole message." },
  {
    id: "stripe",
    name: "Stripe",
    description: "A thick accent stripe on the left of the message.",
  },
  {
    id: "split",
    name: "Split",
    description: "Heading block and text block in two coloured parts.",
  },
  { id: "minimal", name: "Minimal", description: "Plain text feel: small wordmark, no boxes." },
];

export type EmailDesign = { id: string; layout: string; palette: string; name: string };

export const DESIGNS: readonly EmailDesign[] = LAYOUTS.flatMap((layout) =>
  PALETTES.map((palette) => ({
    id: `${layout.id}.${palette.id}`,
    layout: layout.id,
    palette: palette.id,
    name: `${layout.name} · ${palette.name}`,
  })),
);

export const DEFAULT_DESIGN = "card.classic";

export const findDesign = (id: string): EmailDesign | undefined => DESIGNS.find((d) => d.id === id);
export const findPalette = (id: string): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;

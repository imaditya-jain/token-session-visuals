// Static site chrome (navigation + testimonials). Products and collections are NOT here:
// they come from Shopify via src/data/catalog.ts.

export const navLinks = [
  { label: "Shop Plants", href: "/collections/house-plants" },
  { label: "Collections", href: "#collections" },
  { label: "Our Story", href: "#our-story" },
  { label: "About us", href: "#footer" },
];

export const testimonials = [
  {
    quote:
      "Every plant arrived picture-perfect, packed like a little gift. My monstera has already pushed out three new leaves.",
    name: "Amelia Hart",
    location: "Portland, OR",
  },
  {
    quote:
      "The care cards are a wonderful touch. I've killed plenty of ferns before — this one is thriving on month three.",
    name: "Daniel Okafor",
    location: "Austin, TX",
  },
  {
    quote:
      "Beautiful pots, honest plants, zero fuss. Fernwood is the first shop I recommend to friends who say they can't keep anything alive.",
    name: "Priya Raman",
    location: "Brooklyn, NY",
  },
];

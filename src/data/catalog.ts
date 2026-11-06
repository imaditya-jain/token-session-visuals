import houseplants from "@/assets/collection-houseplants.jpg";
import succulents from "@/assets/collection-succulents.jpg";
import planters from "@/assets/collection-planters.jpg";
import tools from "@/assets/collection-tools.jpg";

import monstera from "@/assets/product-monstera.jpg";
import snakePlant from "@/assets/product-snake-plant.jpg";
import fiddleFig from "@/assets/product-fiddle-fig.jpg";
import peaceLily from "@/assets/product-peace-lily.jpg";
import calathea from "@/assets/product-calathea.jpg";
import zzPlant from "@/assets/product-zz-plant.jpg";
import birdOfParadise from "@/assets/product-bird-of-paradise.jpg";
import orchid from "@/assets/product-orchid.jpg";

import echeveria from "@/assets/product-echeveria.jpg";
import barrelCactus from "@/assets/product-barrel-cactus.jpg";
import jadePlant from "@/assets/product-jade-plant.jpg";
import stringOfPearls from "@/assets/product-string-of-pearls.jpg";

import terracottaTrio from "@/assets/product-terracotta-trio.jpg";
import ceramicPlanter from "@/assets/product-ceramic-planter.jpg";
import hangingPlanter from "@/assets/product-hanging-planter.jpg";
import concretePots from "@/assets/product-concrete-pots.jpg";

import seedPackets from "@/assets/product-seed-packets.jpg";
import wateringCan from "@/assets/product-watering-can.jpg";
import toolSet from "@/assets/product-tool-set.jpg";
import pruners from "@/assets/product-pruners.jpg";

export type Collection = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  badge?: "Sale" | "Bestseller" | "New";
  light: string;
  size: string;
  inStock: boolean;
  collectionSlugs: string[];
};

export const collections: Collection[] = [
  {
    slug: "house-plants",
    name: "House Plants",
    tagline: "Lush classics for every room",
    description:
      "Nursery-grown indoor plants, from sculptural statement pieces to easy-going greenery for first-time plant parents.",
    image: houseplants,
  },
  {
    slug: "succulents-cacti",
    name: "Succulents & Cacti",
    tagline: "Small plants, big character",
    description:
      "Drought-loving, desk-sized greenery that thrives on sunshine and a little neglect.",
    image: succulents,
  },
  {
    slug: "pots-planters",
    name: "Pots & Planters",
    tagline: "Handmade, natural, timeless",
    description:
      "Terracotta, ceramic and concrete vessels, thrown and fired to age beautifully alongside your plants.",
    image: planters,
  },
  {
    slug: "seeds-tools",
    name: "Seeds & Tools",
    tagline: "Everything the gardener needs",
    description:
      "Heirloom seeds and heirloom-quality tools — the small kit that keeps every pot and patch thriving.",
    image: tools,
  },
];

export const products: Product[] = [
  {
    id: "p1",
    slug: "monstera-deliciosa",
    name: "Monstera Deliciosa",
    category: "House Plants",
    price: 49,
    image: monstera,
    badge: "Bestseller",
    light: "Bright, indirect light",
    size: '24" — 34" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p2",
    slug: "snake-plant-laurentii",
    name: "Snake Plant Laurentii",
    category: "House Plants",
    price: 39,
    compareAtPrice: 49,
    image: snakePlant,
    badge: "Sale",
    light: "Low to bright light",
    size: '22" — 30" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p3",
    slug: "fiddle-leaf-fig",
    name: "Fiddle Leaf Fig",
    category: "House Plants",
    price: 65,
    image: fiddleFig,
    light: "Bright, filtered light",
    size: '30" — 40" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p4",
    slug: "peace-lily",
    name: "Peace Lily",
    category: "House Plants",
    price: 34,
    image: peaceLily,
    light: "Medium, indirect light",
    size: '18" — 24" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p5",
    slug: "calathea-orbifolia",
    name: "Calathea Orbifolia",
    category: "House Plants",
    price: 44,
    image: calathea,
    badge: "New",
    light: "Medium, indirect light",
    size: '16" — 22" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p6",
    slug: "zz-plant",
    name: "ZZ Plant",
    category: "House Plants",
    price: 29,
    compareAtPrice: 36,
    image: zzPlant,
    badge: "Sale",
    light: "Thrives in low light",
    size: '18" — 26" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p7",
    slug: "bird-of-paradise",
    name: "Bird of Paradise",
    category: "House Plants",
    price: 89,
    image: birdOfParadise,
    light: "Bright, direct light",
    size: '36" — 48" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p8",
    slug: "white-orchid",
    name: "White Phalaenopsis Orchid",
    category: "House Plants",
    price: 52,
    image: orchid,
    badge: "Bestseller",
    light: "Soft, indirect light",
    size: '20" — 26" tall',
    inStock: true,
    collectionSlugs: ["house-plants"],
  },
  {
    id: "p9",
    slug: "echeveria-perle",
    name: "Echeveria 'Perle'",
    category: "Succulents & Cacti",
    price: 18,
    image: echeveria,
    badge: "New",
    light: "Bright, direct light",
    size: '4" — 6" across',
    inStock: true,
    collectionSlugs: ["succulents-cacti"],
  },
  {
    id: "p10",
    slug: "golden-barrel-cactus",
    name: "Golden Barrel Cactus",
    category: "Succulents & Cacti",
    price: 24,
    image: barrelCactus,
    light: "Full sun",
    size: '6" — 10" across',
    inStock: false,
    collectionSlugs: ["succulents-cacti"],
  },
  {
    id: "p11",
    slug: "jade-plant",
    name: "Jade Plant",
    category: "Succulents & Cacti",
    price: 32,
    image: jadePlant,
    light: "Bright, direct light",
    size: '10" — 14" tall',
    inStock: true,
    collectionSlugs: ["succulents-cacti"],
  },
  {
    id: "p12",
    slug: "string-of-pearls",
    name: "String of Pearls",
    category: "Succulents & Cacti",
    price: 26,
    compareAtPrice: 32,
    image: stringOfPearls,
    badge: "Sale",
    light: "Bright, indirect light",
    size: '6" — 8" across',
    inStock: true,
    collectionSlugs: ["succulents-cacti"],
  },
  {
    id: "p13",
    slug: "terracotta-pot-trio",
    name: "Terracotta Pot Trio",
    category: "Pots & Planters",
    price: 28,
    image: terracottaTrio,
    light: "Drainage holes included",
    size: 'Set of 3: 4", 6" & 8"',
    inStock: true,
    collectionSlugs: ["pots-planters"],
  },
  {
    id: "p14",
    slug: "speckled-ceramic-planter",
    name: "Speckled Ceramic Planter",
    category: "Pots & Planters",
    price: 36,
    image: ceramicPlanter,
    badge: "Bestseller",
    light: "Glazed inside and out",
    size: '7" diameter',
    inStock: true,
    collectionSlugs: ["pots-planters"],
  },
  {
    id: "p15",
    slug: "hanging-jute-planter",
    name: "Hanging Jute Planter",
    category: "Pots & Planters",
    price: 22,
    image: hangingPlanter,
    badge: "New",
    light: "Fits 6\" pots",
    size: '32" drop length',
    inStock: true,
    collectionSlugs: ["pots-planters"],
  },
  {
    id: "p16",
    slug: "concrete-pot-set",
    name: "Concrete Pot Set",
    category: "Pots & Planters",
    price: 42,
    image: concretePots,
    light: "Sealed, frost-proof",
    size: 'Set of 2: 6" & 8"',
    inStock: true,
    collectionSlugs: ["pots-planters"],
  },
  {
    id: "p17",
    slug: "heirloom-seed-collection",
    name: "Heirloom Seed Collection",
    category: "Seeds & Tools",
    price: 19,
    image: seedPackets,
    light: "Flowers, herbs & veg",
    size: "5 packets",
    inStock: true,
    collectionSlugs: ["seeds-tools"],
  },
  {
    id: "p18",
    slug: "brass-watering-can",
    name: "Brass Watering Can",
    category: "Seeds & Tools",
    price: 38,
    image: wateringCan,
    badge: "Bestseller",
    light: "1.2 L capacity",
    size: '9" tall',
    inStock: true,
    collectionSlugs: ["seeds-tools"],
  },
  {
    id: "p19",
    slug: "garden-tool-set",
    name: "Garden Tool Set",
    category: "Seeds & Tools",
    price: 46,
    compareAtPrice: 58,
    image: toolSet,
    badge: "Sale",
    light: "Stainless steel & beech",
    size: "Trowel & pruners",
    inStock: true,
    collectionSlugs: ["seeds-tools"],
  },
  {
    id: "p20",
    slug: "walnut-pruners",
    name: "Walnut Pruners & Twine",
    category: "Seeds & Tools",
    price: 24,
    image: pruners,
    light: "Bypass blade",
    size: '8" handles',
    inStock: true,
    collectionSlugs: ["seeds-tools"],
  },
];

export const bestSellers: Product[] = [
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "p7",
  "p8",
].map((id) => products.find((p) => p.id === id)!);

export const getCollection = (slug: string) =>
  collections.find((c) => c.slug === slug);

export const getProduct = (slug: string) => products.find((product) => product.slug === slug);

export const getCollectionProducts = (slug: string) =>
  products.filter((p) => p.collectionSlugs.includes(slug));

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

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);

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
import fern from "@/assets/product-fern.jpg";
import orchid from "@/assets/product-orchid.jpg";

export type Collection = {
  slug: string;
  name: string;
  tagline: string;
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
};

export const collections: Collection[] = [
  {
    slug: "house-plants",
    name: "House Plants",
    tagline: "Lush classics for every room",
    image: houseplants,
  },
  {
    slug: "succulents-cacti",
    name: "Succulents & Cacti",
    tagline: "Small plants, big character",
    image: succulents,
  },
  {
    slug: "pots-planters",
    name: "Pots & Planters",
    tagline: "Handmade, natural, timeless",
    image: planters,
  },
  {
    slug: "seeds-tools",
    name: "Seeds & Tools",
    tagline: "Everything the gardener needs",
    image: tools,
  },
];

export const bestSellers: Product[] = [
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
  },
  {
    id: "p4",
    slug: "peace-lily",
    name: "Peace Lily",
    category: "Flowering",
    price: 34,
    image: peaceLily,
    light: "Medium, indirect light",
    size: '18" — 24" tall',
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
  },
  {
    id: "p8",
    slug: "white-orchid",
    name: "White Phalaenopsis Orchid",
    category: "Flowering",
    price: 52,
    image: orchid,
    badge: "Bestseller",
    light: "Soft, indirect light",
    size: '20" — 26" tall',
  },
];

export const navLinks = [
  { label: "Shop Plants", href: "#best-sellers" },
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

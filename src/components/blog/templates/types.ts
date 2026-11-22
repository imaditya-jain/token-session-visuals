import type { PublicPost, PublicPostCard } from "@/lib/blog-types";
import type { Product } from "@/lib/types";
import type { PublicCategory } from "@/server/services/blog-public";

/** Everything a template may show. Templates are pure layout: they fetch nothing. */
export type TemplateProps = {
  post: PublicPost;
  related: PublicPostCard[];
  categories: PublicCategory[];
  products: Product[];
};

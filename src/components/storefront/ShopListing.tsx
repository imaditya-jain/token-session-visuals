import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ListingBrowser from "@/components/storefront/ListingBrowser";
import { Footer } from "@/components/storefront/sections";
import { getProducts, getProductTypes, getSalesOrder } from "@/data/catalog";
import { SHOP_PATH } from "@/lib/shop";
import { getPageContent } from "@/server/services/page-content-public";

/**
 * The shop. The page is prebuilt and cached; it carries the whole catalogue once and the browser does the
 * filtering, sorting and paging (see ListingBrowser), so none of that ever waits for a server.
 */
export default async function ShopListing() {
  const [products, types, salesOrder, c] = await Promise.all([
    getProducts(),
    getProductTypes(),
    getSalesOrder(),
    getPageContent("shop"),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <CollectionBanner
          image="/images/seasonal-greenhouse.jpg"
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />

        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <h2 className="sr-only">Products</h2>
          <ListingBrowser
            products={products}
            types={types}
            basePath={SHOP_PATH}
            salesOrder={salesOrder}
            empty={{ title: c.text("empty", "title"), text: c.text("empty", "text") }}
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}

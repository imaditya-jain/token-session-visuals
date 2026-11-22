import ListingPage, { listingMetadata } from "@/components/blog/ListingPage";

export const revalidate = 3600;

export const generateMetadata = () => listingMetadata({ kind: "all" });

export default function BlogIndexPage() {
  return <ListingPage scope={{ kind: "all" }} />;
}

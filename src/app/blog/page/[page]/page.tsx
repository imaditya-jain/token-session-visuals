import ListingPage, { listingMetadata } from "@/components/blog/ListingPage";

export const revalidate = 3600;

type Props = { params: Promise<{ page: string }> };

export const generateMetadata = async ({ params }: Props) =>
  listingMetadata({ kind: "all" }, (await params).page);

export default async function BlogPagedPage({ params }: Props) {
  return <ListingPage scope={{ kind: "all" }} rawPage={(await params).page} />;
}

import ListingPage, { listingMetadata } from "@/components/blog/ListingPage";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export const generateMetadata = async ({ params }: Props) =>
  listingMetadata({ kind: "tag", slug: (await params).slug });

export default async function BlogTermPage({ params }: Props) {
  return <ListingPage scope={{ kind: "tag", slug: (await params).slug }} />;
}

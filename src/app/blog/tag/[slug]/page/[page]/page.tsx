import ListingPage, { listingMetadata } from "@/components/blog/ListingPage";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string; page: string }> };

export const generateMetadata = async ({ params }: Props) => {
  const { slug, page } = await params;
  return listingMetadata({ kind: "tag", slug }, page);
};

export default async function BlogTermPagedPage({ params }: Props) {
  const { slug, page } = await params;
  return <ListingPage scope={{ kind: "tag", slug }} rawPage={page} />;
}

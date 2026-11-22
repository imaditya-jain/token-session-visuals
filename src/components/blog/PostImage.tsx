import Image from "next/image";

import type { FeaturedImage } from "@/lib/blog-types";

/** The featured image at a fixed aspect ratio (no layout shift), served through the image optimiser. */
export default function PostImage({
  image,
  title,
  className = "",
  sizes,
  priority = false,
  aspect = "aspect-[16/9]",
}: {
  image: FeaturedImage;
  title: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  aspect?: string;
}) {
  return (
    <Image
      src={image.url}
      alt={image.alt || title}
      width={image.width ?? 1600}
      height={image.height ?? 900}
      sizes={sizes}
      priority={priority}
      className={`${aspect} w-full object-cover ${className}`}
    />
  );
}

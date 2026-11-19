import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CONTACT_TOPICS } from "@/lib/contact-schemas";

/** "Talk to us" band at the foot of content pages; preselects the topic on the contact form. */
export default function ContactCta({
  title,
  topic,
  label = "Contact us",
}: {
  title: string;
  topic: (typeof CONTACT_TOPICS)[number];
  label?: string;
}) {
  return (
    <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl bg-sage-light/50 p-6">
      <p className="mr-auto font-display text-lg text-forest">{title}</p>
      <Button asChild className="h-11 px-7">
        <Link href={`/contact?topic=${encodeURIComponent(topic)}`}>{label}</Link>
      </Button>
    </div>
  );
}

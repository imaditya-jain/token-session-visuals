import { Facebook, Instagram, Linkedin, MessageCircle, Twitter, Youtube } from "lucide-react";

import type { SocialPlatform } from "@/lib/site-chrome";

/** Pinterest is not in the icon set, so it is drawn here (same size and stroke-less style as the others). */
function Pinterest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.82-.17-2.08.04-2.98l1.2-5.1s-.3-.61-.3-1.52c0-1.42.82-2.48 1.85-2.48.87 0 1.29.65 1.29 1.44 0 .88-.56 2.19-.85 3.4-.24 1.02.51 1.85 1.51 1.85 1.82 0 3.22-1.92 3.22-4.69 0-2.45-1.76-4.17-4.28-4.17-2.92 0-4.63 2.19-4.63 4.45 0 .88.34 1.82.76 2.33.08.1.09.19.07.29l-.28 1.16c-.04.18-.15.22-.34.13-1.28-.6-2.08-2.46-2.08-3.96 0-3.22 2.34-6.18 6.75-6.18 3.54 0 6.3 2.52 6.3 5.9 0 3.52-2.22 6.35-5.3 6.35-1.04 0-2.01-.54-2.34-1.18l-.64 2.46c-.23.89-.85 2-1.27 2.68A10 10 0 1 0 12 2Z" />
    </svg>
  );
}

const ICONS: Record<SocialPlatform, (props: { className?: string }) => React.JSX.Element> = {
  instagram: (p) => <Instagram {...p} aria-hidden />,
  facebook: (p) => <Facebook {...p} aria-hidden />,
  twitter: (p) => <Twitter {...p} aria-hidden />,
  youtube: (p) => <Youtube {...p} aria-hidden />,
  linkedin: (p) => <Linkedin {...p} aria-hidden />,
  pinterest: (p) => <Pinterest {...p} />,
  whatsapp: (p) => <MessageCircle {...p} aria-hidden />,
};

export default function SocialIcon({
  platform,
  className,
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  return ICONS[platform]({ className: className ?? "size-4" });
}

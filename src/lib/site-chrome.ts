import { z } from "zod";

import { safeHref } from "@/lib/rich-text/parse";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

/** Menu and footer links may go to this site, the web, a mailbox or a phone (never `javascript:` and friends). */
const link = z
  .string()
  .trim()
  .min(1, "Enter a link")
  .max(2048)
  .refine(
    (value) => safeHref(value) !== null,
    "Use a web address, a path like /shop, mailto: or tel:",
  );

const label = (max: number) => z.string().trim().min(1, "Required").max(max);

const subLink = z.object({ label: label(40), href: link });
export const navItemSchema = z.object({
  label: label(40),
  href: link,
  /** A dropdown: the item's own link plus up to eight links beneath it. */
  children: z.array(subLink).max(8).default([]),
});

export const announcementItemSchema = z.object({
  text: label(120),
  /** Optional accent text shown after the text in the sage colour. */
  highlight: z.string().trim().max(60).default(""),
  hideOnMobile: z.boolean().default(false),
});

const footerLinkSchema = z.object({ label: label(40), href: link });
const footerColumnSchema = z.object({
  heading: label(30),
  links: z.array(footerLinkSchema).max(10),
});

export const SOCIAL_PLATFORMS = {
  instagram: "Instagram",
  facebook: "Facebook",
  twitter: "Twitter",
  pinterest: "Pinterest",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
} as const;
export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;
export const SOCIAL_PLATFORM_IDS = Object.keys(SOCIAL_PLATFORMS) as [
  SocialPlatform,
  ...SocialPlatform[],
];

/** Social profile addresses are always full https links (WhatsApp uses https://wa.me/<number>). */
const socialUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use the full https:// address of the profile");

export const socialLinkSchema = z.object({
  id: z.string().min(1).max(40),
  platform: z.enum(SOCIAL_PLATFORM_IDS),
  /** A not-yet-set link (empty or the legacy `#footer` placeholder) can only be disabled. */
  url: z.string().trim().max(2048),
  enabled: z.boolean(),
});

const chromeShape = z.object({
  announcement: z.object({
    enabled: z.boolean(),
    items: z.array(announcementItemSchema).max(4),
  }),
  header: z.object({ nav: z.array(navItemSchema).max(8) }),
  footer: z.object({
    about: z.string().trim().max(400),
    contact: z.object({
      address: z.string().trim().max(200),
      email: z.string().trim().max(254),
      phone: z.string().trim().max(40),
      /** The number the phone link dials, with country code (e.g. +15035550142). Empty = digits of the shown number. */
      phoneDial: z
        .string()
        .trim()
        .max(20)
        .refine(
          (v) => v === "" || /^\+?\d{6,19}$/.test(v),
          "Digits only, optionally starting with +",
        ),
      hours: z.string().trim().max(120),
    }),
    columns: z.array(footerColumnSchema).max(5),
    legal: z.array(footerLinkSchema).max(6),
    copyright: label(120),
  }),
  newsletter: z.object({
    eyebrow: label(60),
    heading: label(100),
    text: label(300),
    buttonLabel: label(24),
    footnote: z.string().trim().max(120),
  }),
  social: z.array(socialLinkSchema).max(12),
});

/** Placeholders are an unfinished state: tolerated while drafting, never in what is published. */
const withChecks = (allowPlaceholders: boolean) =>
  chromeShape.superRefine((chrome, ctx) => {
    chrome.social.forEach((entry, index) => {
      const unset = allowPlaceholders && isPlaceholderUrl(entry.url);
      if (entry.enabled && !unset && !socialUrl.safeParse(entry.url).success) {
        ctx.addIssue({
          code: "custom",
          path: ["social", index, "url"],
          message: `${SOCIAL_PLATFORMS[entry.platform]}: use the full https:// address, or switch the link off.`,
        });
      }
    });
    const ids = chrome.social.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", path: ["social"], message: "Duplicate social link." });
    }
    const email = chrome.footer.contact.email;
    if (email && !z.email().safeParse(email).success) {
      ctx.addIssue({
        code: "custom",
        path: ["footer", "contact", "email"],
        message: "Enter a valid email address.",
      });
    }
  });

/** What may be saved as a draft. */
export const chromeDraftSchema = withChecks(true);
/** What may be published (and therefore shown on the storefront). */
export const chromeSchema = withChecks(false);

export type SiteChrome = z.infer<typeof chromeSchema>;
export type NavItem = SiteChrome["header"]["nav"][number];
export type SocialLink = SiteChrome["social"][number];

/**
 * What the storefront shows until the owner publishes something else. It is the content that used to be written
 * into the header and footer components, so a fresh install looks exactly as before. "Journal" is the one addition:
 * it connects the blog to the storefront navigation.
 */
export const DEFAULT_CHROME: SiteChrome = {
  announcement: {
    enabled: true,
    items: [
      { text: "Free shipping on orders over $75", highlight: "", hideOnMobile: true },
      { text: "Spring Greenhouse Event —", highlight: "up to 30% off", hideOnMobile: false },
    ],
  },
  header: {
    nav: [
      { label: "Shop Plants", href: "/shop", children: [] },
      { label: "Collections", href: "/collections", children: [] },
      { label: "Journal", href: "/blog", children: [] },
      { label: "Reels", href: "/reels", children: [] },
      { label: "About us", href: "/about", children: [] },
    ],
  },
  footer: {
    about:
      "Premium nursery-grown plants, handmade pots and honest advice — helping homes go green since 1962.",
    contact: {
      address: "1234 Greenhouse Lane, Portland, OR 97210",
      email: "hello@fernwood.shop",
      phone: "(503) 555-0142",
      phoneDial: "+15035550142",
      hours: "Mon–Sat, 9am–6pm PST",
    },
    columns: [
      {
        heading: "Shop",
        links: [
          { label: "House Plants", href: "/collections/house-plants" },
          { label: "Succulents & Cacti", href: "/collections/succulents-cacti" },
          { label: "Pots & Planters", href: "/collections/pots-planters" },
          { label: "Seeds & Tools", href: "/collections/seeds-tools" },
          { label: "Gift Cards", href: "/gift-cards" },
        ],
      },
      {
        heading: "Company",
        links: [
          { label: "Our Story", href: "/about" },
          { label: "Journal", href: "/blog" },
          { label: "Wholesale", href: "/wholesale" },
          { label: "Gardener Services", href: "/gardener-services" },
        ],
      },
      {
        heading: "Help",
        links: [
          { label: "Shipping & Delivery", href: "/shipping-delivery" },
          { label: "Plant Guarantee", href: "/plant-guarantee" },
          { label: "Care Library", href: "/care-guide" },
          { label: "FAQs", href: "/faq" },
          { label: "Contact Us", href: "/contact" },
        ],
      },
    ],
    legal: [
      { label: "Privacy Policy", href: "/policies/privacy-policy" },
      { label: "Terms of Service", href: "/policies/terms-of-service" },
      { label: "Accessibility", href: "/accessibility" },
    ],
    copyright: "Fernwood Nursery Co. All rights reserved.",
  },
  newsletter: {
    eyebrow: "Join the greenhouse club",
    heading: "Get 10% off your first order",
    text: "Seasonal care tips, early access to rare drops and members-only savings — one thoughtful email a month, never spam.",
    buttonLabel: "Subscribe",
    footnote: "Unsubscribe anytime. No green thumb required.",
  },
  // Profile addresses aren't public yet: the four icons the design shows are kept (as before, pointing at the footer)
  // until the owner enters real https:// addresses in the admin.
  social: [
    { id: "instagram", platform: "instagram", url: "#footer", enabled: true },
    { id: "facebook", platform: "facebook", url: "#footer", enabled: true },
    { id: "twitter", platform: "twitter", url: "#footer", enabled: true },
    { id: "youtube", platform: "youtube", url: "#footer", enabled: true },
  ],
};

/** The link for a phone number: the explicit dial number if given, else the digits of the shown text. */
export const phoneHref = (phone: string, dial = ""): string =>
  `tel:${dial || phone.replace(/[^\d+]/g, "")}`;

export function isPlaceholderUrl(url: string): boolean {
  return url === "" || url === "#footer";
}

/**
 * Before publishing: social icons that still have no real address are switched off (an icon that goes nowhere
 * shouldn't ship). Returns what was hidden so the admin can be told.
 */
export function normalizeForPublish(chrome: SiteChrome): {
  chrome: SiteChrome;
  hidden: SocialPlatform[];
} {
  const hidden: SocialPlatform[] = [];
  const social = chrome.social.map((entry) => {
    if (entry.enabled && isPlaceholderUrl(entry.url)) {
      hidden.push(entry.platform);
      return { ...entry, enabled: false };
    }
    return entry;
  });
  return { chrome: { ...chrome, social }, hidden };
}

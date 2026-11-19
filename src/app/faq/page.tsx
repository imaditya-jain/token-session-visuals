import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import JsonLd from "@/components/seo/JsonLd";
import { money, store } from "@/data/store-info";

export const metadata: Metadata = {
  title: "FAQs — Fernwood",
  description: "Answers about orders, shipping, the plant guarantee, plant care and your account.",
  alternates: { canonical: "/faq" },
};

const { shipping } = store;
const link = "font-medium text-forest underline underline-offset-4 hover:text-clay";

type Item = { question: string; answer: ReactNode; text: string };
type Group = { title: string; items: Item[] };

const groups: Group[] = [
  {
    title: "Orders & shipping",
    items: [
      {
        question: "How much does shipping cost?",
        text: `Standard shipping is ${money(shipping.standard)} and free on orders over ${money(shipping.freeThreshold)}. Express is ${money(shipping.express)}. International shipping is a flat ${money(shipping.international)}. All prices are in ${store.currency}.`,
        answer: (
          <>
            Standard shipping is {money(shipping.standard)} and free on orders over{" "}
            {money(shipping.freeThreshold)}. Express is {money(shipping.express)}. International
            shipping is a flat {money(shipping.international)}. All prices are in {store.currency}.
            See{" "}
            <Link href="/shipping-delivery" className={link}>
              shipping &amp; delivery
            </Link>{" "}
            for details.
          </>
        ),
      },
      {
        question: "Which countries do you ship to?",
        text: `We ship to ${shipping.countries} countries. Checkout shows whether yours is included once you enter your address.`,
        answer: (
          <>
            We ship to {shipping.countries} countries. Checkout shows whether yours is included once
            you enter your address.
          </>
        ),
      },
      {
        question: "How do I track my order?",
        text: "Sign in and open My orders to see the status of each order. Confirm your email address first so your order history is available.",
        answer: (
          <>
            Sign in and open{" "}
            <Link href="/account/orders" className={link}>
              My orders
            </Link>{" "}
            to see the status of each order. Confirm your email address first so your order history
            is available.
          </>
        ),
      },
      {
        question: "My plant arrived damaged. What now?",
        text: `Contact us within ${store.guaranteeDays} days with your order number and a photo, and we will replace it.`,
        answer: (
          <>
            Contact us within {store.guaranteeDays} days with your order number and a photo, and we
            will replace it. Read the{" "}
            <Link href="/plant-guarantee" className={link}>
              plant guarantee
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: "Plants & care",
    items: [
      {
        question: "Do the plants come with care instructions?",
        text: "Yes. Every order includes a detailed care card, and our care guide covers light, watering, feeding and repotting.",
        answer: (
          <>
            Yes. Every order includes a detailed care card, and our{" "}
            <Link href="/care-guide" className={link}>
              care guide
            </Link>{" "}
            covers light, watering, feeding and repotting.
          </>
        ),
      },
      {
        question: "My plant is dropping leaves after arriving. Is that normal?",
        text: "A little leaf drop is normal while a plant adjusts to new light. Keep conditions steady and avoid moving it around. If it continues, contact us with a photo.",
        answer: (
          <>
            A little leaf drop is normal while a plant adjusts to new light. Keep conditions steady
            and avoid moving it around. If it continues,{" "}
            <Link href="/contact?topic=Plant%20care%20advice" className={link}>
              send us a photo
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: "Your account",
    items: [
      {
        question: "Do I need an account to order?",
        text: "No. An account lets you see your order history and manage your details. Confirm your email address to unlock order history.",
        answer: (
          <>
            No. An account lets you see your order history and manage your details. Confirm your
            email address to unlock order history.{" "}
            <Link href="/register" className={link}>
              Create an account
            </Link>
            .
          </>
        ),
      },
      {
        question: "I forgot my password.",
        text: "Use the forgot password page and we will email you a link to choose a new one. The link works for one hour.",
        answer: (
          <>
            Use the{" "}
            <Link href="/forgot-password" className={link}>
              forgot password
            </Link>{" "}
            page and we will email you a link to choose a new one. The link works for one hour.
          </>
        ),
      },
      {
        question: "How do I stop receiving emails?",
        text: "Every marketing email has an unsubscribe link at the bottom. You can also change your preference in your account settings.",
        answer: (
          <>
            Every marketing email has an unsubscribe link at the bottom. You can also change your
            preference in your{" "}
            <Link href="/account" className={link}>
              account settings
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    title: "Reaching us",
    items: [
      {
        question: "How can I contact you?",
        text: `Use the contact form, email ${store.email} or call ${store.phone}. We are available ${store.hours}.`,
        answer: (
          <>
            Use the{" "}
            <Link href="/contact" className={link}>
              contact form
            </Link>
            , email{" "}
            <a href={`mailto:${store.email}`} className={link}>
              {store.email}
            </a>{" "}
            or call{" "}
            <a href={store.phoneHref} className={link}>
              {store.phone}
            </a>
            . We are available {store.hours}.
          </>
        ),
      },
    ],
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: groups.flatMap((group) =>
    group.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.text },
    })),
  ),
};

export default function FaqPage() {
  return (
    <ContentShell
      eyebrow="Help"
      title="Frequently asked questions"
      intro="Quick answers about orders, plants and your account."
    >
      <JsonLd data={structuredData} />
      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`faq-${group.title}`}>
            <h2
              id={`faq-${group.title}`}
              className="mb-4 font-display text-2xl font-medium text-forest"
            >
              {group.title}
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
              {group.items.map((item) => (
                <details key={item.question} className="group px-5 py-4 open:pb-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span
                      aria-hidden
                      className="text-xl leading-none text-clay transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <div className="pt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ContactCta title="Still have a question?" topic="Something else" label="Ask us" />
    </ContentShell>
  );
}

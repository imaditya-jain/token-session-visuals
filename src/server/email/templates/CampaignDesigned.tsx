import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { DEFAULT_DESIGN, findDesign, findPalette, type Palette } from "@/lib/email-designs";

import { brand, company } from "./brand";

export type DesignedCampaignData = {
  design?: string | undefined;
  preheader?: string | undefined;
  eyebrow?: string | undefined;
  heading: string;
  paragraphs: string[];
  image?: { src: string; alt: string } | undefined;
  cta?: { label: string; url: string } | undefined;
  signoff?: string | undefined;
  unsubscribeUrl: string;
};

type Parts = Omit<DesignedCampaignData, "design" | "preheader">;

const display = brand.display;
const body = brand.body;

const Wordmark = ({
  color,
  align = "center",
  size = 30,
}: {
  color: string;
  align?: CSSProperties["textAlign"];
  size?: number;
}) => (
  <Text
    style={{
      margin: 0,
      fontFamily: display,
      fontSize: size,
      fontWeight: 500,
      color,
      textAlign: align,
      letterSpacing: "-0.01em",
    }}
  >
    {company.name}
  </Text>
);

const Eyebrow = ({
  p,
  text,
  align = "left",
  color,
}: {
  p: Palette;
  text?: string | undefined;
  align?: CSSProperties["textAlign"];
  color?: string;
}) =>
  text ? (
    <Text
      style={{
        margin: "0 0 10px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: color ?? p.accent,
        textAlign: align,
      }}
    >
      {text}
    </Text>
  ) : null;

const Title = ({
  p,
  children,
  align = "left",
  size = 28,
  color,
}: {
  p: Palette;
  children: ReactNode;
  align?: CSSProperties["textAlign"];
  size?: number;
  color?: string;
}) => (
  <Heading
    as="h1"
    style={{
      margin: "0 0 16px",
      fontFamily: display,
      fontSize: size,
      lineHeight: `${Math.round(size * 1.22)}px`,
      fontWeight: 500,
      color: color ?? p.heading,
      textAlign: align,
    }}
  >
    {children}
  </Heading>
);

const Paras = ({
  p,
  items,
  align = "left",
  color,
}: {
  p: Palette;
  items: string[];
  align?: CSSProperties["textAlign"];
  color?: string;
}) => (
  <>
    {items.map((text, index) => (
      <Text
        key={index}
        style={{
          margin: "0 0 16px",
          fontSize: 16,
          lineHeight: "26px",
          color: color ?? p.text,
          textAlign: align,
        }}
      >
        {text}
      </Text>
    ))}
  </>
);

const Cta = ({
  p,
  cta,
  block = false,
  align = "left",
  invert = false,
}: {
  p: Palette;
  cta: Parts["cta"];
  block?: boolean;
  align?: CSSProperties["textAlign"];
  invert?: boolean;
}) =>
  cta ? (
    <Section style={{ margin: "24px 0 0", textAlign: align }}>
      <Button
        href={cta.url}
        style={{
          display: block ? "block" : "inline-block",
          boxSizing: "border-box",
          width: block ? "100%" : undefined,
          textAlign: "center",
          backgroundColor: invert ? p.buttonText : p.button,
          color: invert ? p.button : p.buttonText,
          fontFamily: body,
          fontSize: 15,
          fontWeight: 600,
          textDecoration: "none",
          borderRadius: 8,
          padding: "14px 28px",
        }}
      >
        {cta.label}
      </Button>
    </Section>
  ) : null;

const Picture = ({
  image,
  radius = 0,
  margin = "0 0 24px",
}: {
  image: Parts["image"];
  radius?: number;
  margin?: string;
}) =>
  image ? (
    <Img
      src={image.src}
      alt={image.alt}
      width="100%"
      style={{ display: "block", width: "100%", height: "auto", borderRadius: radius, margin }}
    />
  ) : null;

const Signoff = ({
  p,
  text,
  align = "left",
}: {
  p: Palette;
  text?: string | undefined;
  align?: CSSProperties["textAlign"];
}) =>
  text ? (
    <Text
      style={{
        margin: "8px 0 0",
        fontFamily: display,
        fontSize: 18,
        fontStyle: "italic",
        color: p.heading,
        textAlign: align,
      }}
    >
      {text}
    </Text>
  ) : null;

const Footer = ({
  p,
  unsubscribeUrl,
  align = "center",
  onPage = true,
}: {
  p: Palette;
  unsubscribeUrl: string;
  align?: CSSProperties["textAlign"];
  onPage?: boolean;
}) => {
  const color = onPage ? p.muted : p.muted;
  return (
    <Section style={{ padding: "24px 8px 0", textAlign: align }}>
      <Text style={{ margin: "0 0 12px", fontSize: 12, lineHeight: "18px", color }}>
        You&apos;re receiving this because you joined the Fernwood Greenhouse Club.{" "}
        <Link href={unsubscribeUrl} style={{ color: p.accent, textDecoration: "underline" }}>
          Unsubscribe
        </Link>
        .
      </Text>
      <Hr style={{ borderColor: p.border, margin: "12px 0" }} />
      <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color }}>
        {company.name} Nursery Co. · {company.address}
        <br />
        Questions? Write to {company.supportEmail}
      </Text>
    </Section>
  );
};

function Frame({
  p,
  preview,
  children,
  max = 560,
  pad = "32px 12px",
}: {
  p: Palette;
  preview: string;
  children: ReactNode;
  max?: number;
  pad?: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: pad,
          backgroundColor: p.page,
          fontFamily: body,
          color: p.text,
        }}
      >
        <Container style={{ maxWidth: max, margin: "0 auto" }}>{children}</Container>
      </Body>
    </Html>
  );
}

const Card = ({
  p,
  children,
  style,
}: {
  p: Palette;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <Section
    style={{
      backgroundColor: p.card,
      border: `1px solid ${p.border}`,
      borderRadius: 16,
      padding: "36px 32px",
      ...style,
    }}
  >
    {children}
  </Section>
);

function Message({ layout, p, c }: { layout: string; p: Palette; c: Parts }) {
  switch (layout) {
    case "banner":
      return (
        <>
          <Section
            style={{
              backgroundColor: p.band,
              borderRadius: "16px 16px 0 0",
              padding: "22px 32px",
              textAlign: "center",
            }}
          >
            <Wordmark color={p.bandText} />
          </Section>
          <Section
            style={{
              backgroundColor: p.card,
              border: `1px solid ${p.border}`,
              borderTop: 0,
              borderRadius: "0 0 16px 16px",
              padding: "36px 32px",
            }}
          >
            <Eyebrow p={p} text={c.eyebrow} />
            <Title p={p}>{c.heading}</Title>
            <Picture image={c.image} radius={8} />
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} />
            <Signoff p={p} text={c.signoff} />
          </Section>
        </>
      );
    case "editorial":
      return (
        <Section style={{ padding: "8px 8px 0" }}>
          <Wordmark color={p.heading} align="left" size={22} />
          <Hr style={{ borderColor: p.heading, borderWidth: 2, margin: "14px 0 28px" }} />
          <Eyebrow p={p} text={c.eyebrow} />
          <Title p={p} size={40}>
            {c.heading}
          </Title>
          <Picture image={c.image} />
          <Paras p={p} items={c.paragraphs} />
          <Cta p={p} cta={c.cta} />
          <Signoff p={p} text={c.signoff} />
        </Section>
      );
    case "centered":
      return (
        <Card p={p} style={{ textAlign: "center", padding: "44px 36px" }}>
          <Wordmark color={p.heading} size={26} />
          <Hr style={{ borderColor: p.border, margin: "20px auto 28px", width: 48 }} />
          <Eyebrow p={p} text={c.eyebrow} align="center" />
          <Title p={p} align="center" size={30}>
            {c.heading}
          </Title>
          <Picture image={c.image} radius={8} />
          <Paras p={p} items={c.paragraphs} align="center" />
          <Cta p={p} cta={c.cta} align="center" />
          <Signoff p={p} text={c.signoff} align="center" />
        </Card>
      );
    case "hero":
      return (
        <Section
          style={{
            backgroundColor: p.card,
            border: `1px solid ${p.border}`,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <Section style={{ backgroundColor: p.band, padding: "14px 24px", textAlign: "center" }}>
            <Wordmark color={p.bandText} size={22} />
          </Section>
          <Picture image={c.image} margin="0" />
          <Section style={{ padding: "32px" }}>
            <Eyebrow p={p} text={c.eyebrow} />
            <Title p={p}>{c.heading}</Title>
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} />
            <Signoff p={p} text={c.signoff} />
          </Section>
        </Section>
      );
    case "feature":
      return (
        <Section style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${p.border}` }}>
          <Section style={{ backgroundColor: p.band, padding: "44px 32px", textAlign: "center" }}>
            <Eyebrow p={p} text={c.eyebrow} align="center" color={p.bandText} />
            <Title p={p} align="center" size={34} color={p.bandText}>
              {c.heading}
            </Title>
          </Section>
          <Section style={{ backgroundColor: p.card, padding: "32px" }}>
            <Picture image={c.image} radius={8} />
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} />
            <Signoff p={p} text={c.signoff} />
          </Section>
        </Section>
      );
    case "letter":
      return (
        <Card p={p} style={{ borderLeft: `6px solid ${p.accent}`, borderRadius: 4 }}>
          <Text style={{ margin: "0 0 20px", fontSize: 13, color: p.muted }}>
            From the greenhouse at {company.name}
          </Text>
          <Eyebrow p={p} text={c.eyebrow} />
          <Title p={p} size={24}>
            {c.heading}
          </Title>
          <Picture image={c.image} radius={4} />
          <Paras p={p} items={c.paragraphs} />
          <Cta p={p} cta={c.cta} />
          <Signoff p={p} text={c.signoff || "With care,"} />
          <Text style={{ margin: "4px 0 0", fontFamily: display, fontSize: 16, color: p.heading }}>
            The {company.name} growers
          </Text>
        </Card>
      );
    case "promo":
      return (
        <Card p={p} style={{ padding: "0 0 32px", overflow: "hidden" }}>
          <Section style={{ backgroundColor: p.band, padding: "16px 24px", textAlign: "center" }}>
            <Wordmark color={p.bandText} size={22} />
          </Section>
          <Section style={{ padding: "28px 32px 0" }}>
            {c.eyebrow ? (
              <Text style={{ margin: "0 0 14px", textAlign: "center" }}>
                <span
                  style={{
                    display: "inline-block",
                    backgroundColor: p.accent,
                    color: p.buttonText === p.accent ? p.card : p.card,
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  {c.eyebrow}
                </span>
              </Text>
            ) : null}
            <Title p={p} align="center" size={36}>
              {c.heading}
            </Title>
            <Picture image={c.image} radius={8} />
            <Paras p={p} items={c.paragraphs} align="center" />
            <Cta p={p} cta={c.cta} block />
            <Signoff p={p} text={c.signoff} align="center" />
          </Section>
        </Card>
      );
    case "framed":
      return (
        <Section style={{ border: `2px solid ${p.heading}`, padding: 6 }}>
          <Section
            style={{
              border: `1px solid ${p.border}`,
              backgroundColor: p.card,
              padding: "36px 30px",
            }}
          >
            <Wordmark color={p.heading} size={24} />
            <Hr style={{ borderColor: p.border, margin: "18px 0 24px" }} />
            <Eyebrow p={p} text={c.eyebrow} align="center" />
            <Title p={p} align="center">
              {c.heading}
            </Title>
            <Picture image={c.image} />
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} align="center" />
            <Signoff p={p} text={c.signoff} align="center" />
          </Section>
        </Section>
      );
    case "stripe":
      return (
        <Section
          style={{
            backgroundColor: p.card,
            borderLeft: `10px solid ${p.band}`,
            border: `1px solid ${p.border}`,
            borderLeftWidth: 10,
            borderLeftColor: p.band,
            padding: "32px 28px",
          }}
        >
          <Wordmark color={p.heading} align="left" size={20} />
          <Hr style={{ borderColor: p.border, margin: "14px 0 22px" }} />
          <Eyebrow p={p} text={c.eyebrow} />
          <Title p={p}>{c.heading}</Title>
          <Picture image={c.image} />
          <Paras p={p} items={c.paragraphs} />
          <Cta p={p} cta={c.cta} />
          <Signoff p={p} text={c.signoff} />
        </Section>
      );
    case "split":
      return (
        <Section style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${p.border}` }}>
          <Section style={{ backgroundColor: p.band, padding: "28px 32px" }}>
            <Wordmark color={p.bandText} align="left" size={20} />
            <Hr style={{ borderColor: p.bandText, opacity: 0.3, margin: "14px 0 18px" }} />
            <Eyebrow p={p} text={c.eyebrow} color={p.bandText} />
            <Title p={p} size={30} color={p.bandText}>
              {c.heading}
            </Title>
          </Section>
          <Section style={{ backgroundColor: p.card, padding: "28px 32px" }}>
            <Picture image={c.image} radius={6} />
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} />
            <Signoff p={p} text={c.signoff} />
          </Section>
        </Section>
      );
    case "minimal":
      return (
        <Section style={{ padding: "0 8px" }}>
          <Text
            style={{
              margin: "0 0 28px",
              fontSize: 13,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: p.muted,
            }}
          >
            {company.name}
          </Text>
          <Eyebrow p={p} text={c.eyebrow} />
          <Title p={p} size={26}>
            {c.heading}
          </Title>
          <Picture image={c.image} />
          <Paras p={p} items={c.paragraphs} />
          {c.cta ? (
            <Text style={{ margin: "8px 0 0", fontSize: 16 }}>
              <Link
                href={c.cta.url}
                style={{
                  color: p.button === p.page ? p.accent : p.accent,
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {c.cta.label} →
              </Link>
            </Text>
          ) : null}
          <Signoff p={p} text={c.signoff} />
        </Section>
      );
    default:
      return (
        <>
          <Section style={{ padding: "8px 0 24px", textAlign: "center" }}>
            <Wordmark color={p.heading} size={32} />
          </Section>
          <Card p={p}>
            <Eyebrow p={p} text={c.eyebrow} />
            <Title p={p}>{c.heading}</Title>
            <Picture image={c.image} radius={8} />
            <Paras p={p} items={c.paragraphs} />
            <Cta p={p} cta={c.cta} />
            <Signoff p={p} text={c.signoff} />
          </Card>
        </>
      );
  }
}

/** A campaign in one of the 108 designs (`layout.palette`). Plain text only: React escapes every string. */
export default function CampaignDesigned({
  design,
  preheader,
  unsubscribeUrl,
  ...content
}: DesignedCampaignData) {
  const found = findDesign(design ?? DEFAULT_DESIGN) ?? findDesign(DEFAULT_DESIGN)!;
  const p = findPalette(found.palette);
  return (
    <Frame
      p={p}
      preview={preheader ?? content.heading}
      max={found.layout === "editorial" || found.layout === "minimal" ? 600 : 560}
    >
      <Message layout={found.layout} p={p} c={{ ...content, unsubscribeUrl }} />
      <Footer
        p={p}
        unsubscribeUrl={unsubscribeUrl}
        align={found.layout === "editorial" || found.layout === "minimal" ? "left" : "center"}
      />
    </Frame>
  );
}

import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { brand, company } from "./brand";

/** Shared frame for every Fernwood email: cream canvas, wordmark, white card, quiet footer. */
export default function Layout({
  preview,
  children,
  footerNote,
}: {
  preview: string;
  children: ReactNode;
  /** Explains why the recipient got this email (required for marketing). */
  footerNote?: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          margin: 0,
          padding: "32px 12px",
          backgroundColor: brand.cream,
          fontFamily: brand.body,
          color: brand.text,
        }}
      >
        <Container style={{ maxWidth: 560, margin: "0 auto" }}>
          <Section style={{ padding: "8px 0 24px", textAlign: "center" }}>
            <Text
              style={{
                margin: 0,
                fontFamily: brand.display,
                fontSize: 32,
                fontWeight: 500,
                color: brand.forest,
                letterSpacing: "-0.01em",
              }}
            >
              {company.name}
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: brand.card,
              border: `1px solid ${brand.border}`,
              borderRadius: 16,
              padding: "36px 32px",
            }}
          >
            {children}
          </Section>
          <Section style={{ padding: "24px 8px 0", textAlign: "center" }}>
            {footerNote ? (
              <Text
                style={{ margin: "0 0 12px", fontSize: 12, lineHeight: "18px", color: brand.muted }}
              >
                {footerNote}
              </Text>
            ) : null}
            <Hr style={{ borderColor: brand.border, margin: "12px 0" }} />
            <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: brand.muted }}>
              {company.name} Nursery Co. · {company.address}
              <br />
              Questions? Write to {company.supportEmail}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

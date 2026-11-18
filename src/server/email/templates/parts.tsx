import { Button, Heading, Text } from "@react-email/components";
import type { ReactNode } from "react";

import { brand } from "./brand";

export const Title = ({ children }: { children: ReactNode }) => (
  <Heading
    as="h1"
    style={{
      margin: "0 0 16px",
      fontFamily: brand.display,
      fontSize: 28,
      lineHeight: "34px",
      fontWeight: 500,
      color: brand.forest,
    }}
  >
    {children}
  </Heading>
);

export const Paragraph = ({ children }: { children: ReactNode }) => (
  <Text style={{ margin: "0 0 16px", fontSize: 16, lineHeight: "26px", color: brand.text }}>
    {children}
  </Text>
);

export const Muted = ({ children }: { children: ReactNode }) => (
  <Text style={{ margin: "20px 0 0", fontSize: 13, lineHeight: "20px", color: brand.muted }}>
    {children}
  </Text>
);

export const Cta = ({ href, children }: { href: string; children: ReactNode }) => (
  <Button
    href={href}
    style={{
      display: "inline-block",
      backgroundColor: brand.forest,
      color: brand.cream,
      fontFamily: brand.body,
      fontSize: 15,
      fontWeight: 600,
      textDecoration: "none",
      borderRadius: 8,
      padding: "14px 28px",
    }}
  >
    {children}
  </Button>
);

/** Plain link fallback for clients that block buttons. */
export const LinkFallback = ({ href }: { href: string }) => (
  <Text
    style={{
      margin: "20px 0 0",
      fontSize: 12,
      lineHeight: "18px",
      color: brand.muted,
      wordBreak: "break-all",
    }}
  >
    Or paste this link into your browser:
    <br />
    <span style={{ color: brand.clayDeep }}>{href}</span>
  </Text>
);

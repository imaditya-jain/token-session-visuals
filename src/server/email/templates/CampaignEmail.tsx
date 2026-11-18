import { Link, Text } from "@react-email/components";

import { brand } from "./brand";
import Layout from "./Layout";
import { Cta, Paragraph, Title } from "./parts";

export type CampaignData = {
  subject: string;
  preheader?: string | undefined;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string } | undefined;
  unsubscribeUrl: string;
  oneClickUrl: string;
};

/** Marketing email. Plain-text paragraphs only (React escapes them), so campaign copy can never inject markup. */
export default function CampaignEmail({
  preheader,
  heading,
  paragraphs,
  cta,
  unsubscribeUrl,
}: CampaignData) {
  return (
    <Layout
      preview={preheader ?? heading}
      footerNote={
        <>
          You&apos;re receiving this because you joined the Fernwood Greenhouse Club.{" "}
          <Link
            href={unsubscribeUrl}
            style={{ color: brand.clayDeep, textDecoration: "underline" }}
          >
            Unsubscribe
          </Link>
          .
        </>
      }
    >
      <Title>{heading}</Title>
      {paragraphs.map((text, index) => (
        <Paragraph key={index}>{text}</Paragraph>
      ))}
      {cta ? (
        <Text style={{ margin: "24px 0 0" }}>
          <Cta href={cta.url}>{cta.label}</Cta>
        </Text>
      ) : null}
    </Layout>
  );
}

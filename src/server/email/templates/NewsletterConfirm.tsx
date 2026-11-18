import Layout from "./Layout";
import { Cta, LinkFallback, Muted, Paragraph, Title } from "./parts";

export default function NewsletterConfirm({ url }: { url: string }) {
  return (
    <Layout preview="One tap to join the Greenhouse Club.">
      <Title>Join the Greenhouse Club</Title>
      <Paragraph>
        Confirm your email to get seasonal care tips, early access to rare drops and members-only
        savings, one thoughtful email a month.
      </Paragraph>
      <Cta href={url}>Yes, sign me up</Cta>
      <LinkFallback href={url} />
      <Muted>
        If you didn&apos;t request this, just ignore this email and you won&apos;t be subscribed.
      </Muted>
    </Layout>
  );
}

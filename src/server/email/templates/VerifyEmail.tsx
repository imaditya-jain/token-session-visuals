import Layout from "./Layout";
import { Cta, LinkFallback, Muted, Paragraph, Title } from "./parts";

export default function VerifyEmail({ firstName, url }: { firstName: string; url: string }) {
  return (
    <Layout preview="Confirm your email to finish setting up your Fernwood account.">
      <Title>Confirm your email</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        Welcome to Fernwood. Please confirm your email address so we can keep your orders and
        account safe.
      </Paragraph>
      <Cta href={url}>Confirm my email</Cta>
      <LinkFallback href={url} />
      <Muted>
        This link expires in 24 hours. If you didn&apos;t create a Fernwood account, you can ignore
        this email.
      </Muted>
    </Layout>
  );
}

import Layout from "./Layout";
import { Cta, LinkFallback, Muted, Paragraph, Title } from "./parts";

export default function ResetPassword({ firstName, url }: { firstName: string; url: string }) {
  return (
    <Layout preview="Reset your Fernwood password.">
      <Title>Reset your password</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        We received a request to reset the password for your Fernwood account. Choose a new one with
        the button below.
      </Paragraph>
      <Cta href={url}>Choose a new password</Cta>
      <LinkFallback href={url} />
      <Muted>
        This link expires in 1 hour and can be used once. If you didn&apos;t ask for this, you can
        safely ignore this email; your password won&apos;t change.
      </Muted>
    </Layout>
  );
}

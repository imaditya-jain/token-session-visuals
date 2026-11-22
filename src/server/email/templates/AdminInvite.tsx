import Layout from "./Layout";
import { Cta, LinkFallback, Muted, Paragraph, Title } from "./parts";

export default function AdminInvite({
  firstName,
  roleName,
  url,
}: {
  firstName: string;
  roleName: string;
  url: string;
}) {
  return (
    <Layout preview="You have been invited to the Fernwood admin.">
      <Title>You&apos;re invited to the Fernwood admin</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        You have been given the <strong>{roleName}</strong> role. Choose a password to activate your
        account; each sign-in then also asks for a one-time code sent to this address.
      </Paragraph>
      <Cta href={url}>Set my password</Cta>
      <LinkFallback href={url} />
      <Muted>
        This link expires in 1 hour and works once. If you weren&apos;t expecting an invitation, you
        can ignore this email.
      </Muted>
    </Layout>
  );
}

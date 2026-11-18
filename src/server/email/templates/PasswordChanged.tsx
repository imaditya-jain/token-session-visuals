import { company } from "./brand";
import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

export default function PasswordChanged({ firstName }: { firstName: string }) {
  return (
    <Layout preview="Your Fernwood password was changed.">
      <Title>Your password was changed</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        The password for your Fernwood account was just changed, and you were signed out of all
        devices.
      </Paragraph>
      <Muted>
        If this was you, there&apos;s nothing more to do. If it wasn&apos;t, reset your password
        right away and contact us at {company.supportEmail}.
      </Muted>
    </Layout>
  );
}

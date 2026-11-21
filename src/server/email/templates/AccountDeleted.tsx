import { company } from "./brand";
import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

export default function AccountDeleted({ firstName }: { firstName: string }) {
  return (
    <Layout preview="Your Fernwood account has been deleted.">
      <Title>Your account has been deleted</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        As you asked, we deleted your Fernwood account, signed you out everywhere and removed your
        newsletter subscription. We also asked our commerce provider to erase the customer record we
        held for you.
      </Paragraph>
      <Muted>
        Past orders are kept without any link to you, because we must keep financial records. If you
        didn&apos;t request this, contact us right away at {company.supportEmail}.
      </Muted>
    </Layout>
  );
}

import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

/**
 * Sent to the person who used the contact or wholesale form. It repeats nothing they typed except their name, so it
 * can't be used to deliver someone else's words to a third party's inbox.
 */
export default function EnquiryReceived({
  kind,
  name,
  reference,
}: {
  kind: "contact" | "wholesale";
  name: string;
  reference: string;
}) {
  const wholesale = kind === "wholesale";
  return (
    <Layout preview={`We've received your ${wholesale ? "application" : "message"}.`}>
      <Title>{wholesale ? "We've received your application" : "We've received your message"}</Title>
      <Paragraph>Hi {name},</Paragraph>
      <Paragraph>
        {wholesale
          ? "Thank you for your interest in trading with Fernwood. Our team will review your application and reply to this email address."
          : "Thank you for getting in touch. A member of our team will read your message and reply to this email address."}
      </Paragraph>
      <Paragraph>
        Your reference is <strong>{reference}</strong>. Quote it if you write to us again about
        this.
      </Paragraph>
      <Muted>
        You don&apos;t need to do anything else. If you didn&apos;t send this, you can ignore this
        email.
      </Muted>
    </Layout>
  );
}

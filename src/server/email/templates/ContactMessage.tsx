import { Hr, Text } from "@react-email/components";

import { brand } from "./brand";
import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

export type ContactMessageData = { name: string; email: string; topic: string; message: string };

/** Internal notification for the shop team. Message text is rendered as escaped text, never HTML. */
export default function ContactMessage({ name, email, topic, message }: ContactMessageData) {
  return (
    <Layout preview={`${topic} — message from ${name}`}>
      <Title>New message from the website</Title>
      <Paragraph>
        <strong>{name}</strong> ({email})
      </Paragraph>
      <Paragraph>
        <strong>Topic:</strong> {topic}
      </Paragraph>
      <Hr style={{ borderColor: brand.border, margin: "16px 0" }} />
      <Text
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          fontSize: 16,
          lineHeight: "26px",
          color: brand.text,
        }}
      >
        {message}
      </Text>
      <Muted>Reply to this email to answer {name} directly.</Muted>
    </Layout>
  );
}

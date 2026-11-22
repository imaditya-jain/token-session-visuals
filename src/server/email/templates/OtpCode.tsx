import { Text } from "@react-email/components";

import { brand } from "./brand";
import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

export default function OtpCode({
  firstName,
  code,
  minutes,
  audience,
}: {
  firstName: string;
  code: string;
  minutes: number;
  audience: "admin" | "customer";
}) {
  return (
    <Layout preview={`Your Fernwood sign-in code is ${code}.`}>
      <Title>Your sign-in code</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>
        {audience === "admin"
          ? "Use this code to finish signing in to the Fernwood admin."
          : "Use this code to finish signing in to your Fernwood account."}
      </Paragraph>
      <Text
        style={{
          margin: "8px 0 8px",
          fontFamily: brand.display,
          fontSize: 38,
          letterSpacing: "10px",
          fontWeight: 500,
          color: brand.forest,
        }}
      >
        {code}
      </Text>
      <Muted>
        The code expires in {minutes} minutes and works once. Fernwood will never ask you for it by
        phone or chat. If you didn&apos;t try to sign in, you can ignore this email, but consider
        changing your password.
      </Muted>
    </Layout>
  );
}

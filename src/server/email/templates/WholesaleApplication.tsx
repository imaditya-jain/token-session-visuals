import { Hr, Text } from "@react-email/components";

import { brand } from "./brand";
import Layout from "./Layout";
import { Muted, Paragraph, Title } from "./parts";

export type WholesaleApplicationData = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  businessType: string;
  location: string;
  taxId: string;
  message: string;
};

/** Internal notification for the shop team. Applicant text is rendered as escaped text, never HTML. */
export default function WholesaleApplication(data: WholesaleApplicationData) {
  return (
    <Layout preview={`Wholesale application: ${data.businessName}`}>
      <Title>New wholesale application</Title>
      <Paragraph>
        <strong>{data.businessName}</strong> ({data.businessType}, {data.location})
      </Paragraph>
      <Paragraph>
        <strong>Contact:</strong> {data.contactName}, {data.email}, {data.phone}
      </Paragraph>
      {data.taxId ? (
        <Paragraph>
          <strong>Tax or registration number:</strong> {data.taxId}
        </Paragraph>
      ) : null}
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
        {data.message}
      </Text>
      <Muted>Reply to this email to answer {data.contactName} directly.</Muted>
    </Layout>
  );
}

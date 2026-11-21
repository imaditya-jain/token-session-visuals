import Layout from "./Layout";
import { Cta, LinkFallback, Muted, Paragraph, Title } from "./parts";

export type OrderUpdateData = {
  firstName: string;
  orderName: string;
  headline: string;
  message: string;
  url: string;
};

export default function OrderUpdate({
  firstName,
  orderName,
  headline,
  message,
  url,
}: OrderUpdateData) {
  return (
    <Layout preview={`${headline}: order ${orderName}`}>
      <Title>{headline}</Title>
      <Paragraph>Hi {firstName},</Paragraph>
      <Paragraph>{message}</Paragraph>
      <Cta href={url}>View order {orderName}</Cta>
      <LinkFallback href={url} />
      <Muted>You are getting this because you have a Fernwood account with this order on it.</Muted>
    </Layout>
  );
}

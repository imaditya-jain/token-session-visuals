import AuthShell from "@/components/auth/AuthShell";
import ContactForm from "@/components/contact/ContactForm";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("contact", "/contact");

export default async function ContactPage() {
  const c = await getPageContent("contact");
  return (
    <AuthShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      description={c.text("intro", "description")}
    >
      <ContactForm />
    </AuthShell>
  );
}

import HeaderView from "@/components/storefront/HeaderView";
import { getSiteChrome } from "@/server/services/site-chrome-public";

/** Storefront header: announcement bar and menu come from the admin (header and footer pages). */
export default async function Header() {
  const chrome = await getSiteChrome();
  return (
    <HeaderView
      announcement={chrome.announcement}
      nav={chrome.header.nav}
      helpEmail={chrome.footer.contact.email}
    />
  );
}

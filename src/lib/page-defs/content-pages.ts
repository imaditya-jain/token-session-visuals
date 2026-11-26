import { money, store } from "@/data/store-info";
import {
  area,
  faqs,
  image,
  link,
  richtext,
  text,
  text as text_,
  type FieldDef,
  type PageDef,
  type SectionDef,
} from "@/lib/page-content-core";
import { doc, h2, ol, p, ul } from "@/lib/page-defs/doc";

const { shipping } = store;

const header = (eyebrow: string, title: string, intro?: string): SectionDef => ({
  id: "header",
  label: "Page heading",
  fields: {
    eyebrow: text("Small line above the title", eyebrow, 60),
    title: text("Title", title, 80),
    ...(intro !== undefined ? { intro: area("Introduction", intro, 400) } : {}),
  },
});

const seo = (title: string, description: string): SectionDef => ({
  id: "seo",
  label: "Search engines",
  fields: {
    metaTitle: text("Title shown in search results and the browser tab", title, 70),
    metaDescription: area("Description shown in search results", description, 300),
  },
});

const body = (label: string, content: ReturnType<typeof doc>): SectionDef => ({
  id: "body",
  label,
  fields: { content: richtext("Content", content) },
});

const cta = (title: string, label: string): SectionDef => ({
  id: "cta",
  label: "Contact button",
  fields: {
    title: text("Heading", title, 80),
    label: text("Button text", label, 40),
  },
});

const page = (id: string, title: string, path: string, sections: SectionDef[]): PageDef => ({
  id,
  title,
  path,
  sections,
});

const cardsField = (label: string, def: { title: string; text: string }[]): FieldDef => ({
  kind: "cards",
  label,
  maxItems: 8,
  default: def,
});

export const ABOUT = page("about", "Our story", "/about", [
  header("Three generations of growers", "Our story"),
  seo(
    "Our story — Fernwood",
    "Fernwood began as a single glasshouse on a family farm in 1962. Meet the growers behind every plant.",
  ),
  {
    id: "story",
    label: "Story",
    fields: {
      image: image("Picture", {
        src: "/images/story-nursery.jpg",
        alt: "A Fernwood grower holding a tray of seedlings in the nursery",
      }),
      title: text("Heading", "Three generations of growers, one shared obsession", 120),
      content: richtext(
        "Text",
        doc(
          p(
            "Fernwood began as a single glasshouse on our family farm in 1962. Today we propagate over 120 species across four nurseries, and every plant still passes through the hands of a grower before it ships.",
          ),
          p(
            "We believe a plant should arrive ready to thrive, not merely survive. That means honest sizing, healthy roots, and guidance that continues long after the box is opened.",
          ),
        ),
      ),
    },
  },
  {
    id: "principles",
    label: "What we stand for",
    fields: {
      title: text("Heading", "What we stand for", 80),
      items: cardsField("Principles", [
        {
          title: "Nursery-grown quality",
          text: "Every plant is raised in our own greenhouses, never brokered from unknown sources.",
        },
        {
          title: "Arrive-alive guarantee",
          text: "Protective packaging and a 30-day guarantee. If it arrives unhappy, we replace it.",
        },
        {
          title: "Care that continues",
          text: "Photo check-ins, a detailed care card and horticulturists on chat for the life of your plant.",
        },
        {
          title: "Grown responsibly",
          text: "Peat-free soils, recycled packaging and integrated pest management instead of sprays.",
        },
      ]),
    },
  },
  {
    id: "actions",
    label: "Buttons at the bottom",
    fields: {
      primary: link("First button", { label: "Shop the greenhouse", href: "/shop" }),
      secondary: link("Second button", { label: "Read the care guide", href: "/care-guide" }),
    },
  },
]);

export const CARE_GUIDE = page("care-guide", "Plant care guide", "/care-guide", [
  header(
    "Care library",
    "Plant care guide",
    "Five habits that keep most houseplants happy. Every plant ships with its own care card, so use this as the general picture.",
  ),
  seo(
    "Plant care guide — Fernwood",
    "Light, watering, soil and troubleshooting basics for houseplants and succulents, from the Fernwood growers.",
  ),
  body(
    "Guide",
    doc(
      h2("1. Get the light right"),
      p(
        "Light is the biggest factor in plant health. **Bright, indirect light** means a spot near a window where the plant sees plenty of sky but the sun doesn't hit the leaves for hours. **Medium light** is a few steps back from a window. **Low light** tolerates a dimmer room, but even tough plants grow slowly there. Succulents and cacti want **full sun**: the brightest window you have.",
      ),
      p(
        "Turn pots a quarter turn every week or two so growth stays even, and move plants gradually if you change their light, since sudden jumps scorch leaves.",
      ),
      h2("2. Water when the plant needs it, not on a schedule"),
      p(
        "Check the soil with a finger. For most foliage plants, water when the top few centimetres are dry; for succulents and cacti, wait until the soil is dry all the way through. Water thoroughly until it drains out of the bottom, then empty the saucer. Overwatering kills far more plants than forgetting does.",
      ),
      ul([
        "Yellowing lower leaves and soft stems usually mean too much water.",
        "Crispy brown edges and drooping often mean too little water or very dry air.",
        "Use room-temperature water, and water less in winter when growth slows.",
      ]),
      h2("3. Pots need drainage"),
      p(
        "A pot with drainage holes lets excess water escape so roots don't sit wet. If you love a pot without holes, keep the plant in a plain nursery pot and slip it inside as a cover pot, lifting it out to water.",
      ),
      h2("4. Feed lightly in the growing season"),
      p(
        "From spring to early autumn, a balanced houseplant fertiliser at half the label strength every month or so is plenty. Skip feeding in winter, and never fertilise a dry or stressed plant.",
      ),
      h2("5. Repot when roots run out of room"),
      p(
        "Roots circling the pot or poking out of the drainage holes mean it's time for a pot one size up. Spring is the best moment. Use fresh, free-draining mix and water well afterwards.",
      ),
      h2("Troubleshooting"),
      ul([
        "**Leaves dropping after arrival:** a little shedding is normal while the plant adjusts to new light. Keep conditions steady and don't move it around.",
        "**Tiny insects or sticky leaves:** isolate the plant, wipe the leaves, and treat with insecticidal soap. Check again after a week.",
        "**Leggy, stretching growth:** it needs more light.",
      ]),
    ),
  ),
  {
    id: "help",
    label: "Help box at the bottom",
    fields: {
      title: text("Heading", "Still stuck with a plant?", 80),
      cta: link("Button", { label: "Ask a grower", href: "/contact" }),
    },
  },
]);

export const PLANT_GUARANTEE = page("plant-guarantee", "Plant guarantee", "/plant-guarantee", [
  header(
    "Help",
    "Plant guarantee",
    `Protective packaging and a ${store.guaranteeDays}-day guarantee. If it arrives unhappy, we replace it.`,
  ),
  seo(
    "Plant guarantee — Fernwood",
    `Our ${store.guaranteeDays}-day arrive-alive guarantee: if your plant arrives unhappy, we replace it.`,
  ),
  body(
    "Guarantee",
    doc(
      h2("Our promise"),
      p(
        `Every plant is raised in our own greenhouses and checked by a grower before it ships. If your plant arrives damaged or unhappy, we will replace it. That is our ${store.guaranteeDays}-day arrive-alive guarantee.`,
      ),
      h2("How to claim"),
      ol([
        `[Contact us](/contact?topic=Returns%20or%20guarantee) within ${store.guaranteeDays} days with your order number.`,
        "Include a clear photo of the plant and its packaging so we can see what happened.",
        "We will take it from there and make it right.",
      ]),
      h2("Helping your plant settle in"),
      p(
        "A little leaf drop after a journey is normal while a plant adjusts to new light. Our [care guide](/care-guide) covers light, watering and troubleshooting, and our horticulturists are happy to look at photos.",
      ),
    ),
  ),
  cta("Plant arrived unhappy?", "Start a claim"),
]);

export const SHIPPING_DELIVERY = page(
  "shipping-delivery",
  "Shipping & delivery",
  "/shipping-delivery",
  [
    header(
      "Help",
      "Shipping & delivery",
      "Every plant leaves our greenhouse in protective, plant-friendly packaging. Here is what shipping costs and how it works.",
    ),
    seo(
      "Shipping & delivery — Fernwood",
      `Shipping rates, free shipping over ${money(shipping.freeThreshold)}, and how your plants are packed and delivered.`,
    ),
    body(
      "Packing, destinations and tracking",
      doc(
        h2("How we pack"),
        p(
          "Plants are packed with protective, recycled packaging so they arrive ready to thrive. Every order includes a detailed care card for the plants inside.",
        ),
        h2("Where we ship"),
        p(
          `We ship to ${shipping.countries} countries. If yours is on the list, checkout will offer it once you enter your address. Duties and taxes for international orders are shown at checkout where they apply.`,
        ),
        h2("Tracking your order"),
        p(
          "Sign in and open [My orders](/account/orders) to see the status of every order. Confirm your email address first so your order history is available.",
        ),
        h2("If something goes wrong"),
        p(
          "If a plant arrives damaged or unhappy, our [plant guarantee](/plant-guarantee) has you covered.",
        ),
      ),
    ),
    cta("Questions about a delivery?", "Contact us"),
  ],
);

export const CAREERS = page("careers", "Careers", "/careers", [
  header("Company", "Careers", "Join the people who grow, pack and care for Fernwood plants."),
  seo("Careers — Fernwood", "Careers at Fernwood: tell us about yourself."),
  body(
    "Text",
    doc(
      p(
        "We do not have any open roles listed at the moment. If you grow, pack or care for plants for a living, or you simply love them, we would still like to hear from you.",
      ),
      p(
        "Tell us a little about yourself and what you would like to do, and we will keep it in mind.",
      ),
    ),
  ),
  cta("Interested in working with us?", "Get in touch"),
]);

export const PRESS = page("press", "Press", "/press", [
  header("Company", "Press", "Interviews, images and stories from the nursery."),
  seo("Press — Fernwood", "Press and partnership enquiries."),
  body(
    "Text",
    doc(
      p(
        "For interviews, product samples, images or partnerships, send us a note and tell us about your project and deadline.",
      ),
      p(
        "Fernwood began as a single glasshouse on a family farm in 1962. Read more about [our story](/about).",
      ),
    ),
  ),
  cta("Working on a story?", "Contact us"),
]);

export const SUSTAINABILITY = page("sustainability", "Sustainability", "/sustainability", [
  header("Company", "Sustainability", "Growing well, for people and the planet."),
  seo(
    "Sustainability — Fernwood",
    "How Fernwood grows: nursery-grown, peat-free soils, integrated pest management and recycled packaging.",
  ),
  body(
    "Text",
    doc(
      h2("Nursery-grown, not brokered"),
      p(
        "Every plant is raised in our own greenhouses, never brokered from unknown sources, so we know how it was grown.",
      ),
      h2("Peat-free soils"),
      p("We grow in peat-free soils, protecting peatlands that store carbon and shelter wildlife."),
      h2("Fewer sprays"),
      p(
        "We use integrated pest management instead of sprays, working with beneficial insects and careful monitoring.",
      ),
      h2("Recycled packaging"),
      p("Plants travel in protective, recycled packaging designed so they arrive ready to thrive."),
    ),
  ),
  cta("Questions about how we grow?", "Ask us"),
]);

export const ACCESSIBILITY = page("accessibility", "Accessibility", "/accessibility", [
  header(
    "Company",
    "Accessibility",
    "We want everyone to be able to browse, shop and manage their account on our store.",
  ),
  seo(
    "Accessibility — Fernwood",
    "How we work to make the Fernwood store usable by everyone, and how to tell us about a problem.",
  ),
  body(
    "Text",
    doc(
      h2("What we do"),
      ul([
        "Pages use clear headings, landmarks and labelled form fields so screen readers can navigate them.",
        "Everything can be used with a keyboard, with visible focus on links, buttons and form fields.",
        "Buttons and links on touch screens are sized to be easy to tap.",
        "Text and controls use colours chosen for readable contrast.",
        "Product images have descriptive text alternatives.",
      ]),
      h2("Our aim"),
      p(
        "We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We are always improving, and some parts of the store may not meet that standard yet.",
      ),
      h2("Tell us about a problem"),
      p(
        `If something is hard to use, or you need information in another format, please tell us what you were trying to do and what got in the way. You can also email [${store.email}](mailto:${store.email}) or call [${store.phone}](${store.phoneHref}) (${store.hours}).`,
      ),
    ),
  ),
  cta("Found an accessibility problem?", "Report it"),
]);

export const WHOLESALE = page("wholesale", "Wholesale", "/wholesale", [
  header(
    "Company",
    "Wholesale",
    "Plants and pots for cafés, studios, florists and garden centres.",
  ),
  seo("Wholesale — Fernwood", "Apply for a Fernwood wholesale account for your business."),
  body(
    "Text above the application form",
    doc(
      p(
        "Fernwood plants are nursery-grown in our own greenhouses, so we know exactly what we can supply and when. If you are planting up a business or reselling, apply below.",
      ),
      p(
        "We review every application and come back to you by email. Approved businesses are set up with a wholesale account, and we confirm pricing and terms with you directly.",
      ),
    ),
  ),
]);

export const GIFT_CARDS = page("gift-cards", "Gift cards", "/gift-cards", [
  header(
    "Gifts",
    "Gift cards",
    "Not sure which plant? Let them choose. A Fernwood gift card is the easy way to give greenery.",
  ),
  seo("Gift cards — Fernwood", "Give the gift of greenery with a Fernwood gift card."),
  {
    id: "soon",
    label: "When no gift cards are on sale",
    fields: {
      title: text("Heading", "Gift cards are coming soon", 80),
      text: area(
        "Text",
        "We are getting them ready. Ask us and we will let you know as soon as they are available.",
        300,
      ),
    },
  },
  cta("Want to give a gift now?", "Talk to us"),
]);

const answer = (s: string) => s;
export const FAQ = page("faq", "Frequently asked questions", "/faq", [
  header(
    "Help",
    "Frequently asked questions",
    "Quick answers about orders, plants and your account.",
  ),
  seo(
    "FAQs — Fernwood",
    "Answers about orders, shipping, the plant guarantee, plant care and your account.",
  ),
  {
    id: "questions",
    label: "Questions and answers",
    fields: {
      groups: faqs("Question groups", [
        {
          title: "Orders & shipping",
          items: [
            {
              question: "How much does shipping cost?",
              answer: answer(
                `Standard shipping is ${money(shipping.standard)} and free on orders over ${money(shipping.freeThreshold)}. Express is ${money(shipping.express)}. International shipping is a flat ${money(shipping.international)}. All prices are in ${store.currency}. See [shipping & delivery](/shipping-delivery) for details.`,
              ),
            },
            {
              question: "Which countries do you ship to?",
              answer: `We ship to ${shipping.countries} countries. Checkout shows whether yours is included once you enter your address.`,
            },
            {
              question: "How do I track my order?",
              answer:
                "Sign in and open [My orders](/account/orders) to see the status of each order. Confirm your email address first so your order history is available.",
            },
            {
              question: "My plant arrived damaged. What now?",
              answer: `Contact us within ${store.guaranteeDays} days with your order number and a photo, and we will replace it. Read the [plant guarantee](/plant-guarantee).`,
            },
          ],
        },
        {
          title: "Plants & care",
          items: [
            {
              question: "Do the plants come with care instructions?",
              answer:
                "Yes. Every order includes a detailed care card, and our [care guide](/care-guide) covers light, watering, feeding and repotting.",
            },
            {
              question: "My plant is dropping leaves after arriving. Is that normal?",
              answer:
                "A little leaf drop is normal while a plant adjusts to new light. Keep conditions steady and avoid moving it around. If it continues, [send us a photo](/contact?topic=Plant%20care%20advice).",
            },
          ],
        },
        {
          title: "Your account",
          items: [
            {
              question: "Do I need an account to order?",
              answer:
                "No. An account lets you see your order history and manage your details. Confirm your email address to unlock order history. [Create an account](/register).",
            },
            {
              question: "I forgot my password.",
              answer:
                "Use the [forgot password](/forgot-password) page and we will email you a link to choose a new one. The link works for one hour.",
            },
            {
              question: "How do I stop receiving emails?",
              answer:
                "Every marketing email has an unsubscribe link at the bottom. You can also change your preference in your [account settings](/account).",
            },
          ],
        },
        {
          title: "Reaching us",
          items: [
            {
              question: "How can I contact you?",
              answer: `Use the [contact form](/contact), email [${store.email}](mailto:${store.email}) or call [${store.phone}](${store.phoneHref}). We are available ${store.hours}.`,
            },
          ],
        },
      ]),
    },
  },
  cta("Still have a question?", "Ask us"),
]);

const emptyState = (label: string, title: string, text: string): SectionDef => ({
  id: "empty",
  label,
  fields: {
    title: text_("Heading", title, 80),
    text: area("Text", text, 300),
  },
});

export const CONTACT = page("contact", "Contact us", "/contact", [
  header("Help", "Contact us"),
  {
    id: "intro",
    label: "Text above the form",
    fields: {
      description: area(
        "Text",
        "Questions about an order, a plant that needs rescuing, or wholesale? We reply within one business day.",
        300,
      ),
    },
  },
  seo(
    "Contact us — Fernwood",
    "Questions about an order, a plant or wholesale? Send us a message.",
  ),
]);

export const COLLECTIONS = page("collections", "All collections", "/collections", [
  header("Curated for every corner of your home", "Collections"),
  seo(
    "All collections — Fernwood",
    "Browse every Fernwood collection: house plants, succulents, pots and planters, seeds and tools.",
  ),
  {
    id: "empty",
    label: "When there are no collections yet",
    fields: {
      title: text_("Heading", "Collections are on their way", 80),
      button: link("Button", { label: "Shop all plants", href: "/shop" }),
    },
  },
]);

export const SHOP = page("shop", "Shop all", "/shop", [
  header("Every plant, pot and tool in the greenhouse", "Shop all"),
  seo(
    "Shop all plants — Fernwood",
    "Browse every plant, pot and garden tool from all Fernwood collections. Filter by availability, price and type.",
  ),
  emptyState(
    "When filters match nothing",
    "No products match your filters",
    "Try widening the price range or clearing availability.",
  ),
]);

export const GARDENER = page("gardener-services", "Gardener services", "/gardener-services", [
  header(
    "Services",
    "Gardener services",
    "Book a Fernwood gardener for a single visit, or keep your plants looked after on a regular schedule.",
  ),
  seo(
    "Gardener services — Fernwood",
    "Book a Fernwood gardener for a single visit or on a regular schedule.",
  ),
  {
    id: "hero",
    label: "Top banner",
    fields: {
      image: image("Large arched picture", {
        src: "/images/promo-repotting.jpg",
        alt: "Hands repotting a plant into a terracotta pot",
      }),
      accent: image("Round picture", {
        src: "/images/product-watering-can.jpg",
        alt: "A brass watering can beside potted herbs",
      }),
      badge: text_("Badge on the pictures", "Plant care at your door", 40),
      primary: text_("First button text (goes to the plans)", "See plans and prices", 40),
      secondary: text_("Second button text (goes to how it works)", "How it works", 40),
    },
  },
  {
    id: "steps",
    label: "How it works",
    fields: {
      eyebrow: text_("Small line above the heading", "Simple by design", 60),
      title: text_("Heading", "Three steps to a happier home", 80),
      items: {
        kind: "cards",
        label: "Steps (icons are chosen by position)",
        maxItems: 4,
        default: [
          {
            title: "Choose a plan",
            text: "Pick a one-time visit, or a monthly, fortnightly or weekly plan.",
          },
          {
            title: "Tell us where and when",
            text: "Add your address, your phone number and the day that suits you.",
          },
          {
            title: "We come to you",
            text: "A Fernwood gardener looks after your plants at your address.",
          },
        ],
      },
    },
  },
  {
    id: "care",
    label: "What we look after",
    fields: {
      eyebrow: text_("Small line above the heading", "On every visit", 60, true),
      title: text_("Heading", "What we look after", 80),
      items: {
        kind: "cards",
        label: "Three tiles (picture one is the large one)",
        maxItems: 3,
        default: [
          {
            title: "Repotting and soil",
            text: "Fresh soil and the right pot, when your plant needs it.",
          },
          { title: "Watering and feeding", text: "The right amount, at the right time." },
          { title: "Pruning and tidying", text: "Trimmed, cleaned and ready to grow." },
        ],
      },
      imageOne: image("Large picture", {
        src: "/images/promo-repotting.jpg",
        alt: "Hands repotting a plant into a terracotta pot",
      }),
      imageTwo: image("Second picture", {
        src: "/images/product-watering-can.jpg",
        alt: "A brass watering can",
      }),
      imageThree: image("Third picture", {
        src: "/images/product-pruners.jpg",
        alt: "Garden pruners",
      }),
    },
  },
  {
    id: "plans",
    label: "Plans and prices",
    fields: {
      eyebrow: text_("Small line above the heading", "Plans", 60, true),
      title: text_("Heading", "Pick the rhythm that suits your plants", 80),
      popular: text_(
        "Plan to highlight as most popular (a word from its name, empty for none)",
        "Fortnightly",
        40,
        true,
      ),
      included: {
        kind: "list",
        label: "What every plan includes (shown on each card)",
        maxItems: 6,
        itemMax: 80,
        default: [
          "Care for your plants at your address",
          "You choose the first visit date",
          "Charged per visit, not upfront",
        ],
      },
    },
  },
  {
    id: "text",
    label: "Text above the plans",
    fields: {
      content: area(
        "Text",
        "Choose a one-time visit or a monthly, fortnightly or weekly plan, tell us where and when, and add it to your cart.",
        500,
      ),
    },
  },
  {
    id: "soon",
    label: "When booking is closed",
    fields: {
      title: text_("Heading", "Booking opens soon", 80),
      text: area(
        "Text",
        "We are getting the gardener service ready. Ask us and we will let you know as soon as you can book.",
        300,
      ),
    },
  },
  {
    id: "final",
    label: "Closing banner",
    fields: {
      title: text_("Heading", "Ready for happier plants?", 80),
      text: area("Text", "Pick a plan and tell us when. We take care of the rest.", 200),
    },
  },
  {
    id: "faq",
    label: "Questions",
    fields: {
      title: text_("Heading", "Good to know", 80),
      items: {
        kind: "cards",
        label: "Questions and answers",
        maxItems: 8,
        default: [
          {
            title: "Where do you offer the service?",
            text: "Currently in Nagpur, Pune and Mumbai.",
          },
          {
            title: "How am I charged?",
            text: "A one-time visit is paid at checkout. Plans are charged for each visit.",
          },
          {
            title: "Can I choose the day?",
            text: "Yes. You choose your preferred date when you book.",
          },
        ],
      },
    },
  },
  cta("Questions about a visit?", "Talk to us"),
]);

export const ORDER_CONFIRMED = page("order-confirmed", "Order confirmed", "/order-confirmed", [
  header(
    "Thank you",
    "Order confirmed",
    "Your payment went through and your order is on its way to us.",
  ),
  {
    id: "message",
    label: "Message",
    fields: {
      text: area(
        "Text",
        "We have emailed your confirmation. Signed-in customers can follow the order from their account.",
        300,
      ),
      primary: link("First button", { label: "View my orders", href: "/account/orders" }),
      secondary: link("Second button", { label: "Keep shopping", href: "/shop" }),
    },
  },
]);

const authPage = (
  id: string,
  title: string,
  path: string,
  eyebrow: string,
  heading: string,
  description: string,
) =>
  page(id, title, path, [
    header(eyebrow, heading),
    {
      id: "intro",
      label: "Text under the title",
      fields: { description: area("Text", description, 300) },
    },
  ]);

export const LOGIN = authPage(
  "login",
  "Sign in",
  "/login",
  "Your account",
  "Welcome back",
  "Sign in to see your details and keep shopping.",
);
export const REGISTER = authPage(
  "register",
  "Create account",
  "/register",
  "Join Fernwood",
  "Create your account",
  "Save your details for a faster checkout and easier plant care.",
);
export const FORGOT = authPage(
  "forgot-password",
  "Forgot password",
  "/forgot-password",
  "Your account",
  "Forgot your password?",
  "Enter your email and we'll send you a link to choose a new one.",
);

export const NOT_FOUND = page("not-found", "Page not found (404)", "/", [
  {
    id: "message",
    label: "Message",
    fields: {
      code: text_("Big number", "404", 10),
      title: text_("Heading", "Page not found", 60),
      text: area("Text", "The page you're looking for doesn't exist or has been moved.", 200),
      button: link("Button", { label: "Go home", href: "/" }),
    },
  },
]);

export const PLANT_FINDER = page("plant-finder", "Plant Finder", "/plant-finder", [
  header("Not sure where to start?", "Plant Finder"),
  seo(
    "Plant Finder — Fernwood",
    "Answer a few quick questions, swipe through plants and we'll show the ones that suit your space.",
  ),
  {
    id: "intro",
    label: "Opening screen",
    fields: {
      title: text_("Heading", "Find the plant that fits your life", 80),
      text: area(
        "Text",
        "Tell us about your space, then swipe through a few plants. Like the ones you love and pass on the rest, and we'll show the plants that suit you best.",
        400,
      ),
      button: text_("Button text", "Let's go", 30),
    },
  },
  {
    id: "result",
    label: "Results screen",
    fields: {
      title: text_("Heading", "Your best matches", 80),
      retake: text_("Retake button text", "Start again", 30),
    },
  },
]);

export const CONTENT_PAGES: readonly PageDef[] = [
  ABOUT,
  CARE_GUIDE,
  PLANT_GUARANTEE,
  SHIPPING_DELIVERY,
  FAQ,
  CAREERS,
  PRESS,
  SUSTAINABILITY,
  ACCESSIBILITY,
  WHOLESALE,
  GIFT_CARDS,
  CONTACT,
  COLLECTIONS,
  SHOP,
  GARDENER,
  ORDER_CONFIRMED,
  LOGIN,
  REGISTER,
  FORGOT,
  NOT_FOUND,
  PLANT_FINDER,
];

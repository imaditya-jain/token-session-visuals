// Anonymous shoppers browsing: static/ISR pages (cached HTML) and server-rendered listings.
//   k6 run -e BASE_URL=https://staging.example.com loadtest/browse.js
import { check, sleep } from "k6";
import http from "k6/http";

import { BASE, expectOk, ipFor } from "./common.js";

export const options = {
  scenarios: {
    shoppers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 60 },
        { duration: "60s", target: 60 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    // Cached pages must be fast; server-rendered listings get a larger, still strict, budget.
    "http_req_duration{kind:static}": ["p(95)<300"],
    "http_req_duration{kind:dynamic}": ["p(95)<800"],
    "http_req_duration{kind:api}": ["p(95)<300"],
  },
};

const STATIC_PAGES = [
  "/",
  "/products/monstera-deliciosa",
  "/products/snake-plant-laurentii",
  "/about",
  "/faq",
  "/care-guide",
  "/collections",
];
const DYNAMIC_PAGES = [
  "/shop",
  "/shop?sort=price-asc",
  "/shop?stock=in",
  "/collections/house-plants",
  "/collections/succulents-cacti",
  "/search?q=plant",
];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function () {
  const headers = { "X-Forwarded-For": ipFor(__VU, __ITER) };
  const isStatic = Math.random() < 0.65;
  const path = isStatic ? pick(STATIC_PAGES) : pick(DYNAMIC_PAGES);

  const page = http.get(`${BASE}${path}`, {
    headers,
    tags: { kind: isStatic ? "static" : "dynamic" },
    responseCallback: expectOk,
  });
  check(page, {
    "page is 200": (r) => r.status === 200,
    "page has its heading": (r) => r.body.includes("<h1"),
    "page ships the security policy": (r) => !!r.headers["Content-Security-Policy"],
  });

  // The header cart badge asks the API for the (empty) guest cart on every page that has a cart cookie.
  const cart = http.get(`${BASE}/api/cart`, {
    headers,
    tags: { kind: "api" },
    responseCallback: expectOk,
  });
  check(cart, { "guest cart is 200": (r) => r.status === 200 });

  sleep(1 + Math.random() * 2);
}

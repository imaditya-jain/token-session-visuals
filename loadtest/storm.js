// "Cache-miss storm": every request is a URL nobody asked for before (unique searches and filter combinations), so
// nothing can be served from a cache and every one is rendered on the server. This is the worst case for CPU and
// for the upstream Shopify API, and the place where a missing limit or an accidental N+1 would show up first.
//   k6 run -e BASE_URL=https://staging.example.com loadtest/storm.js
import { check, sleep } from "k6";
import http from "k6/http";

import { BASE, expectOk, ipFor } from "./common.js";

export const options = {
  scenarios: {
    storm: {
      executor: "ramping-arrival-rate",
      startRate: 5,
      timeUnit: "1s",
      preAllocatedVUs: 60,
      maxVUs: 150,
      stages: [
        { duration: "15s", target: 30 },
        { duration: "45s", target: 30 },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    http_req_duration: ["p(95)<1000"],
  },
};

const WORDS = [
  "fern",
  "monstera",
  "cactus",
  "pot",
  "plant",
  "orchid",
  "succulent",
  "jade",
  "tool",
  "seed",
  "fig",
  "lily",
  "snake",
  "ceramic",
  "hanging",
];
const rnd = (n) => Math.floor(Math.random() * n);

export default function () {
  const headers = { "X-Forwarded-For": ipFor(__VU, __ITER) };
  const urls = [
    `/search?q=${WORDS[rnd(WORDS.length)]}+${WORDS[rnd(WORDS.length)]}${rnd(1e6)}`,
    `/shop?min=${rnd(30)}&max=${30 + rnd(80)}&sort=price-${rnd(2) ? "asc" : "desc"}`,
    `/collections/house-plants?min=${rnd(40)}&stock=${rnd(2) ? "in" : "out"}`,
  ];
  const res = http.get(`${BASE}${urls[rnd(urls.length)]}`, { headers, responseCallback: expectOk });
  check(res, { "200 even for an unknown search": (r) => r.status === 200 });
  sleep(0.1);
}

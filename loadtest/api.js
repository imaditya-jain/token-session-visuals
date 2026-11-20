// Signed-in customers hitting the authenticated API. Each virtual user logs in ONCE (login is rate limited and
// deliberately slow: argon2) and then reuses its access token, as the browser does.
//   k6 run -e BASE_URL=https://staging.example.com loadtest/api.js
import { check, sleep } from "k6";
import http from "k6/http";
import { Trend } from "k6/metrics";

import { BASE, expectOk, expectOkOr403, ipFor, json } from "./common.js";

const USERS = 40;
const loginTime = new Trend("login_duration", true);

export const options = {
  scenarios: {
    customers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: USERS },
        { duration: "60s", target: USERS },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{endpoint:me}": ["p(95)<300"],
    "http_req_duration{endpoint:cart}": ["p(95)<300"],
    "http_req_duration{endpoint:orders}": ["p(95)<300"],
    "http_req_duration{endpoint:refresh}": ["p(95)<500"],
    // Password hashing is intentionally expensive (argon2id); it only has to stay usable under load.
    login_duration: ["p(95)<1500"],
  },
};

const PASSWORD = "correct-horse-battery";

export function setup() {
  const stamp = Date.now();
  const users = [];
  for (let n = 0; n < USERS; n++) {
    const address = `load+${stamp}-${n}@example.com`;
    const res = http.post(
      `${BASE}/api/auth/register`,
      JSON.stringify({
        email: address,
        password: PASSWORD,
        firstName: "Load",
        lastName: `User${n}`,
        acceptsMarketing: false,
      }),
      { headers: json({ "X-Forwarded-For": ipFor(1000 + n) }), responseCallback: expectOk },
    );
    if (res.status !== 201)
      throw new Error(`setup: could not register ${address}: ${res.status} ${res.body}`);
    users.push(address);
  }
  return { users };
}

let token = null;
// The refresh cookie is `Secure`, and k6's cookie jar (correctly) will not send a Secure cookie over plain http, so
// the scenario carries it by hand and keeps it in step with rotation, exactly as a browser would.
let refreshCookie = null;
const readRefreshCookie = (res) => {
  const name = Object.keys(res.cookies).find((key) => key.endsWith("fw_rt"));
  const cookie = name && res.cookies[name][0];
  return cookie ? `${name}=${cookie.value}` : null;
};

export default function customer(data) {
  const headers = { "X-Forwarded-For": ipFor(__VU) };

  if (!token) {
    const res = http.post(
      `${BASE}/api/auth/login`,
      JSON.stringify({ email: data.users[(__VU - 1) % data.users.length], password: PASSWORD }),
      {
        headers: json(headers),
        tags: { endpoint: "login" },
        responseCallback: expectOk,
      },
    );
    loginTime.add(res.timings.duration);
    check(res, { "login is 200": (r) => r.status === 200 });
    token = res.status === 200 ? res.json("data.accessToken") : null;
    refreshCookie = readRefreshCookie(res);
    if (!token) {
      sleep(2);
      return;
    }
  }
  const auth = { ...headers, Authorization: `Bearer ${token}` };

  check(
    http.get(`${BASE}/api/me`, {
      headers: auth,
      tags: { endpoint: "me" },
      responseCallback: expectOk,
    }),
    {
      "me is 200": (r) => r.status === 200,
    },
  );
  check(
    http.get(`${BASE}/api/cart`, {
      headers,
      tags: { endpoint: "cart" },
      responseCallback: expectOk,
    }),
    {
      "cart is 200": (r) => r.status === 200,
    },
  );
  // The account is unverified, so order history is refused before Shopify is ever called: 403 is the right answer.
  check(
    http.get(`${BASE}/api/orders`, {
      headers: auth,
      tags: { endpoint: "orders" },
      responseCallback: expectOkOr403,
    }),
    {
      "orders refused for unverified email": (r) => r.status === 403,
    },
  );

  if (__ITER % 15 === 14 && refreshCookie) {
    const res = http.post(`${BASE}/api/auth/refresh`, null, {
      headers: json({ ...headers, Cookie: refreshCookie }),
      jar: new http.CookieJar(),
      tags: { endpoint: "refresh" },
      responseCallback: expectOk,
    });
    check(res, { "refresh is 200": (r) => r.status === 200 });
    if (res.status === 200) {
      token = res.json("data.accessToken");
      refreshCookie = readRefreshCookie(res) || refreshCookie;
    }
  }
  sleep(1 + Math.random() * 2);
}

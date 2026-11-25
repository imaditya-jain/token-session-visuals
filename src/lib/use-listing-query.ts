"use client";

import { useMemo, useSyncExternalStore } from "react";

import { parseShopQuery, type ShopQuery } from "@/lib/shop";

const EVENT = "fernwood:listing-url";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * The address bar's query string. The server (and the first render in the browser) sees "", which is the default
 * view that was prerendered, so hydration always matches; the real query is read right after.
 */
export const useSearchString = (): string =>
  useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );

/** The listing filters, sort and page described by the current address. */
export function useListingQuery(): ShopQuery {
  const search = useSearchString();
  return useMemo(() => {
    const raw: Record<string, string[]> = {};
    for (const [key, value] of new URLSearchParams(search)) (raw[key] ??= []).push(value);
    return parseShopQuery(raw);
  }, [search]);
}

/**
 * Moves to another filter/sort/page of the same listing without asking the server for anything. The address still
 * changes (so it can be shared, bookmarked and used with the back button).
 */
export function navigateListing(href: string): void {
  // Keep Next's own history bookkeeping so back/forward keep working.
  window.history.pushState(window.history.state, "", href);
  window.dispatchEvent(new Event(EVENT));
}

/** For a link: ordinary clicks stay in the page, new-tab and download clicks behave as usual. */
export function interceptLinkClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
  go: (href: string) => void,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  go(href);
}

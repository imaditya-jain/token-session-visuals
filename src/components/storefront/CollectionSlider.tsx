"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal, swipeable strip: scroll-snap on touch and trackpad, arrow buttons and dots for
 * mouse and keyboard users. Slides come from the server as children, so no data is duplicated.
 */
export default function CollectionSlider({
  children,
  label,
}: {
  children: ReactNode[];
  label: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);
  const count = children.length;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const slide = el.children[0] as HTMLElement | undefined;
    const step = slide ? slide.offsetWidth + 16 : el.clientWidth;
    setActive(Math.min(count - 1, Math.round(el.scrollLeft / step)));
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, [count]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  const goTo = (index: number) => {
    const el = track.current;
    const slide = el?.children[Math.max(0, Math.min(count - 1, index))] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };

  const page = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <div className="relative" role="region" aria-roledescription="carousel" aria-label={label}>
      <ul
        ref={track}
        onScroll={measure}
        tabIndex={0}
        aria-label={label}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest sm:-mx-6 sm:gap-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, index) => (
          <li
            key={index}
            className="w-[68%] shrink-0 snap-start [&>a]:block sm:w-[44%] lg:w-[31%] xl:w-[23.5%]"
            style={{ scrollMarginLeft: "1rem" }}
          >
            {child}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => page(-1)}
        disabled={!canPrev}
        aria-label="Previous collections"
        className="absolute left-2 top-[42%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream text-forest shadow-lg ring-1 ring-border/60 transition-all hover:bg-forest hover:text-cream disabled:pointer-events-none disabled:opacity-0 md:flex"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => page(1)}
        disabled={!canNext}
        aria-label="Next collections"
        className="absolute right-2 top-[42%] hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream text-forest shadow-lg ring-1 ring-border/60 transition-all hover:bg-forest hover:text-cream disabled:pointer-events-none disabled:opacity-0 md:flex"
      >
        <ArrowRight className="size-5" aria-hidden />
      </button>

      <div className="mt-6 flex items-center justify-center gap-2" aria-label="Choose a slide">
        {children.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Go to collection ${index + 1} of ${count}`}
            aria-current={index === active}
            className="group flex size-6 items-center justify-center"
          >
            <span
              className={`h-2 rounded-full transition-all duration-300 ${
                index === active ? "w-6 bg-forest" : "w-2 bg-forest/25 group-hover:bg-forest/50"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

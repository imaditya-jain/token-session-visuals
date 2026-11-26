"use client";

import { useEffect, useRef } from "react";

const TIPS = [
  "Most houseplants prefer a good drink less often over a sip every day.",
  "Turn a plant a quarter turn each week and it grows evenly.",
  "Dust on leaves is shade. Wipe them with a soft, damp cloth.",
  "Check the soil with a finger before you water.",
  "Morning light is gentle; midday sun through glass can scorch.",
  "A pot with a drainage hole is a plant's best friend.",
  "New growth is the clearest way a plant says thank you.",
  "Group plants together and they share a little humidity.",
] as const;

const greetingFor = (hour: number) =>
  hour < 5
    ? "Welcome in"
    : hour < 12
      ? "Good morning"
      : hour < 17
        ? "Good afternoon"
        : "Good evening";

/**
 * The small bit of JavaScript the welcome needs: a time-of-day greeting and a different plant-care thought each
 * visit, a Skip button, and taking the overlay out of the page once it has finished. The animation itself is CSS.
 */
export default function WelcomeBehaviour() {
  const skip = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const root = document.getElementById("fw-welcome");
    if (!root || root.hasAttribute("data-off")) return;
    const greeting = document.getElementById("fw-welcome-greeting");
    const tip = document.getElementById("fw-welcome-tip");
    if (greeting) greeting.textContent = `${greetingFor(new Date().getHours())}. Take your time.`;
    if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)] ?? "";
    skip.current?.focus({ preventScroll: true });

    const finish = () => root.setAttribute("data-off", "");
    const onEnd = (event: AnimationEvent) => {
      if (event.target === root && event.animationName === "fw-out") finish();
    };
    root.addEventListener("animationend", onEnd);
    return () => root.removeEventListener("animationend", onEnd);
  }, []);

  return (
    <button
      ref={skip}
      type="button"
      className="fw-w-skip"
      onClick={() => document.getElementById("fw-welcome")?.setAttribute("data-leaving", "")}
    >
      Skip
    </button>
  );
}

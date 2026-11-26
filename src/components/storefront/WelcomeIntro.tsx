import WelcomeBehaviour from "@/components/storefront/WelcomeBehaviour";

type Plant = {
  src: string;
  layer: "far" | "mid" | "front" | "near";
  side: "left" | "right";
  /** Distance from that side's edge, as a fraction of the plant unit (see `--u` in styles.css). Negative hangs off-screen. */
  x: number;
  /** Distance from the bottom, as a fraction of the viewport height. */
  bottom: number;
  /** Width as a fraction of the plant unit. */
  w: number;
  rotate: number;
  mirror?: boolean;
  /** Width over height of the picture. */
  ratio: number;
  /** Seconds into the wind cycle, so the plants never move in unison. */
  delay: number;
};

/** Real plant photographs cut out from the shop's own product pictures, in four depths (same picture as the app). */
const PLANTS: Plant[] = [
  {
    src: "calathea-back",
    ratio: 590 / 591,
    layer: "far",
    side: "left",
    x: -0.14,
    bottom: 0.32,
    w: 0.66,
    rotate: 10,
    delay: 0,
  },
  {
    src: "peace-back",
    ratio: 600 / 467,
    layer: "far",
    side: "right",
    x: -0.1,
    bottom: 0.42,
    w: 0.62,
    rotate: -12,
    mirror: true,
    delay: -1.4,
  },
  {
    src: "monstera",
    ratio: 649 / 624,
    layer: "front",
    side: "left",
    x: -0.24,
    bottom: -0.1,
    w: 1.0,
    rotate: 6,
    delay: -0.6,
  },
  {
    src: "bird",
    ratio: 561 / 647,
    layer: "front",
    side: "left",
    x: -0.12,
    bottom: 0.1,
    w: 0.62,
    rotate: 18,
    delay: -2.2,
  },
  {
    src: "fiddle",
    ratio: 458 / 599,
    layer: "front",
    side: "right",
    x: -0.2,
    bottom: -0.1,
    w: 0.78,
    rotate: -8,
    mirror: true,
    delay: -3,
  },
  {
    src: "fern",
    ratio: 720 / 696,
    layer: "front",
    side: "right",
    x: -0.12,
    bottom: 0.08,
    w: 0.72,
    rotate: -26,
    mirror: true,
    delay: -0.3,
  },
  {
    src: "monstera-near",
    ratio: 640 / 615,
    layer: "near",
    side: "left",
    x: -0.55,
    bottom: -0.32,
    w: 1.05,
    rotate: 14,
    delay: -1.1,
  },
  {
    src: "fiddle-near",
    ratio: 458 / 599,
    layer: "near",
    side: "right",
    x: -0.5,
    bottom: -0.3,
    w: 0.8,
    rotate: -18,
    mirror: true,
    delay: -2.6,
  },
];

const LAYERS = ["far", "front", "near"] as const;

/**
 * The first thing a visitor sees on a visit: a walk into the nursery. Pure markup and CSS animation (nothing here waits
 * for JavaScript to start), so it never delays the page. It plays once per browser session on the home page, is
 * skipped for people arriving from a search engine and for anyone who asks for less motion, and can always be skipped.
 * The inline script runs before the first paint, so a skipped welcome never flashes.
 */
export default function WelcomeIntro() {
  return (
    <div id="fw-welcome" className="fw-welcome" aria-hidden={false}>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var d=document,e=d.getElementById("fw-welcome");if(!e)return;var skip=false;
if(/(?:^|; )fw_welcome=off/.test(d.cookie))skip=true;
if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)skip=true;
if(sessionStorage.getItem("fw_welcome"))skip=true;
var r=d.referrer;if(r){try{var h=new URL(r).hostname;if(/(^|\\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|brave|startpage)\\./.test(h))skip=true;}catch(x){}}
if(skip)e.setAttribute("data-off","");else sessionStorage.setItem("fw_welcome","1");}catch(x){var q=document.getElementById("fw-welcome");if(q)q.setAttribute("data-off","");}})();`,
        }}
      />
      <div className="fw-w-photo" />
      <div className="fw-w-veil" />
      <div className="fw-w-shaft" style={{ left: "14%" }} />
      <div className="fw-w-shaft" style={{ left: "44%", animationDelay: "0.9s" }} />
      <div className="fw-w-shaft" style={{ left: "72%", animationDelay: "0.4s" }} />

      {LAYERS.map((layer) => (
        <div key={layer} className="fw-w-dolly" data-layer={layer}>
          {(["left", "right"] as const).map((side) => (
            <div key={side} className="fw-w-part" data-layer={layer} data-side={side}>
              {PLANTS.filter((p) => p.layer === layer && p.side === side).map((p) => (
                <span
                  key={p.src}
                  className="fw-w-plant"
                  style={
                    {
                      [side]: `calc(${p.x} * var(--u))`,
                      bottom: `calc(${p.bottom} * 100vh)`,
                      width: `calc(${p.w} * var(--u))`,
                      "--r": `${p.rotate}deg`,
                      "--f": p.mirror ? -1 : 1,
                      aspectRatio: String(p.ratio),
                      backgroundImage: `url(/images/foliage/${p.src}.webp)`,
                      animationDelay: `${p.delay}s`,
                    } as React.CSSProperties
                  }
                ></span>
              ))}
            </div>
          ))}
        </div>
      ))}

      <div className="fw-w-edge fw-w-edge-left" />
      <div className="fw-w-edge fw-w-edge-right" />

      <div className="fw-w-text">
        <p className="fw-w-rise fw-w-eyebrow">Step into the greenhouse</p>
        <p className="fw-w-rise fw-w-title">Fernwood</p>
        <div className="fw-w-rise fw-w-late">
          <p id="fw-welcome-greeting" className="fw-w-greeting">
            Welcome to the greenhouse. Take your time.
          </p>
          <p id="fw-welcome-tip" className="fw-w-tip" />
        </div>
      </div>

      <WelcomeBehaviour />
    </div>
  );
}

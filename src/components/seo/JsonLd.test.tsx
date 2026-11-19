import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import JsonLd from "./JsonLd";

describe("JsonLd", () => {
  it("renders valid JSON that cannot close the script element", () => {
    const hostile = { name: "</script><script>alert(1)</script>" };
    const { container } = render(<JsonLd data={hostile} />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(script.innerHTML).not.toContain("</script>");
    expect(JSON.parse(script.innerHTML)).toEqual(hostile);
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeatsBar } from "@/components/ui/Badges";

const html = (p: Parameters<typeof SeatsBar>[0]) => renderToStaticMarkup(createElement(SeatsBar, p));

describe("SeatsBar labels", () => {
  it("prints '% full' in ink-3 (ink-4 is 3.88:1 on the yellow card)", () => {
    const out = html({ seatsLeft: 40, seatsTotal: 60 });
    expect(out).toContain('<span class="text-ink-3 tabular">33% full</span>');
    expect(out).not.toContain("text-ink-4");
  });

  it("keeps urgent labels red on cream and turns them ink on yellow", () => {
    expect(html({ seatsLeft: 3, seatsTotal: 60 })).toContain('class="text-red-ink">Only 3 seats left');
    const onYellow = html({ seatsLeft: 3, seatsTotal: 60, onYellow: true });
    expect(onYellow).toContain('class="text-ink">Only 3 seats left');
    expect(onYellow).not.toContain("text-red-ink");
  });
});

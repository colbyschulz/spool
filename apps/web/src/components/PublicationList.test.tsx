import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublicationList } from "./PublicationList.js";
import type { Publication } from "@skein/shared";

const pubs: Publication[] = [
  { pmid: "1", title: "Graphs", journal: "J", year: 2021, authors: [], pubmedUrl: "u/1" },
];

describe("PublicationList", () => {
  it("renders titles and reports clicks", async () => {
    const onExpand = vi.fn();
    render(<PublicationList publications={pubs} onExpand={onExpand} />);
    await userEvent.click(screen.getByRole("button", { name: /Graphs/ }));
    expect(onExpand).toHaveBeenCalledWith(pubs[0]);
  });
});

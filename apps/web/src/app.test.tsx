import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app.js";

describe("App", () => {
  it("renders the search bar", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Author name")).toBeInTheDocument();
  });
});

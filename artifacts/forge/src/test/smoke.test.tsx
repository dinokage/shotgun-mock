import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("test infrastructure smoke test", () => {
  it("renders a component and finds it via Testing Library", () => {
    render(<div>ok</div>);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });
});

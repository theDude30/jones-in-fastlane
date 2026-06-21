import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

vi.mock("../src/screens/PixiBoard.js", () => ({
  PixiBoard: () => null,
}));

describe("App smoke test", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });
});

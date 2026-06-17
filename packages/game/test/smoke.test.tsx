import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

describe("App smoke test", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });
});

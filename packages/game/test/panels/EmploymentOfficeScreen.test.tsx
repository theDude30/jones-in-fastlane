import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { EmploymentOfficeScreen } from "../../src/screens/panels/EmploymentOfficeScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atEmploymentOffice() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "employmentOffice";
    p.insideBuilding = true;
    return { state: s.state };
  });
}

describe("EmploymentOfficeScreen", () => {
  it("lists employers, then shows that employer's jobs on click", () => {
    atEmploymentOffice();
    render(<EmploymentOfficeScreen />);
    expect(screen.getByText("Monolith Burgers")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Monolith Burgers"));
    expect(screen.getByText(/Cook/)).toBeInTheDocument();
  });

  it("applies for the always-approved Cook job", () => {
    atEmploymentOffice();
    render(<EmploymentOfficeScreen />);
    fireEvent.click(screen.getByText("Monolith Burgers"));
    // Monolith Burgers lists 4 jobs (Cook, Clerk, Assistant Manager, Manager),
    // each with its own Apply button — Cook is listed first in config/jobs.ts.
    fireEvent.click(screen.getAllByText("Apply")[0]);
    expect(useGameStore.getState().state!.players[0].jobId).toBe("monolithBurgers.cook");
  });
});

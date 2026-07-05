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

  it("shows a HIRED notification after a successful application", () => {
    atEmploymentOffice();
    render(<EmploymentOfficeScreen />);
    fireEvent.click(screen.getByText("Monolith Burgers"));
    fireEvent.click(screen.getAllByText("Apply")[0]); // Cook, alwaysApproved
    expect(screen.getByText(/HIRED/)).toBeInTheDocument();
  });

  it("shows a REJECTED notification with the missing degree as the reason", () => {
    atEmploymentOffice();
    render(<EmploymentOfficeScreen />);
    fireEvent.click(screen.getByText("Z-Mart"));
    // Z-Mart lists Clerk, Assistant Manager, Manager — Manager requires the
    // juniorCollege degree, which a fresh player doesn't have, so this is a
    // deterministic stats rejection (no luck roll involved).
    fireEvent.click(screen.getAllByText("Apply")[2]);
    expect(screen.getByText(/REJECTED/)).toBeInTheDocument();
    expect(screen.getByText(/requires Junior College/)).toBeInTheDocument();
    expect(useGameStore.getState().state!.players[0].jobId).toBeNull();
  });

  it("leaves the building when Leave is clicked", () => {
    atEmploymentOffice();
    render(<EmploymentOfficeScreen />);
    fireEvent.click(screen.getByText("Leave"));
    expect(useGameStore.getState().state!.players[0].insideBuilding).toBe(false);
  });
});

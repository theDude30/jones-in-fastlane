import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { UniversityScreen } from "../../src/screens/panels/UniversityScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atUniversity() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "hiTechU";
    p.insideBuilding = true;
    p.cash = 1000;
    return { state: s.state };
  });
}

describe("UniversityScreen", () => {
  it("enrolls in a no-prereq degree", () => {
    atUniversity();
    render(<UniversityScreen />);
    fireEvent.click(screen.getAllByText("Enroll")[0]);
    const p = useGameStore.getState().state!.players[0];
    expect(p.enrollments.length).toBe(1);
  });

  it("studies an enrolled degree", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining: 10 }];
      return { state: s.state };
    });
    render(<UniversityScreen />);
    fireEvent.click(screen.getByText("Study"));
    const p = useGameStore.getState().state!.players[0];
    expect(p.enrollments[0].lessonsRemaining).toBe(9);
  });

  it("does not offer Enroll for a degree whose prereq isn't met", () => {
    atUniversity();
    render(<UniversityScreen />);
    // businessAdmin requires juniorCollege; with no degrees owned, its Enroll
    // button must not appear (only no-prereq degrees should show one).
    const businessAdminRow = screen.getByText(/Business Administration/).closest("li")!;
    expect(businessAdminRow.querySelector("button")).toBeNull();
  });
});

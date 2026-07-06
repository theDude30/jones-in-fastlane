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

  it("studies an enrolled degree and shows its remaining lessons", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining: 10 }];
      return { state: s.state };
    });
    render(<UniversityScreen />);
    expect(screen.getByText(/10 lessons left/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Study"));
    const p = useGameStore.getState().state!.players[0];
    expect(p.enrollments[0].lessonsRemaining).toBe(9);
  });

  it("hides a degree entirely when its prereq isn't met", () => {
    atUniversity();
    render(<UniversityScreen />);
    // businessAdmin requires juniorCollege; with no degrees owned it
    // shouldn't be offerable yet, so the tablet shouldn't list it at all.
    expect(screen.queryByText(/Business Administration/)).not.toBeInTheDocument();
  });

  it("reveals a degree once its prereq is met", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].degrees = ["juniorCollege"];
      return { state: s.state };
    });
    render(<UniversityScreen />);
    expect(screen.getByText("Business Administration")).toBeInTheDocument();
  });

  it("lists a graduated degree as completed", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].degrees = ["juniorCollege"];
      return { state: s.state };
    });
    render(<UniversityScreen />);
    expect(screen.getByText(/✓ Junior College/)).toBeInTheDocument();
  });

  it("shows an error and does not enroll when cash is too low", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].cash = 0;
      return { state: s.state };
    });
    render(<UniversityScreen />);
    fireEvent.click(screen.getAllByText("Enroll")[0]);
    expect(screen.getByText(/Not enough cash/)).toBeInTheDocument();
    expect(useGameStore.getState().state!.players[0].enrollments.length).toBe(0);
  });

  it("leaves the building when Leave is clicked", () => {
    atUniversity();
    render(<UniversityScreen />);
    fireEvent.click(screen.getByText("Leave"));
    expect(useGameStore.getState().state!.players[0].insideBuilding).toBe(false);
  });

  it("shows hours remaining as a Time Left readout", () => {
    atUniversity();
    useGameStore.setState((s) => {
      s.state!.players[0].hoursRemaining = 12.5;
      return { state: s.state };
    });
    render(<UniversityScreen />);
    expect(screen.getByText("12.5h")).toBeInTheDocument();
  });

  it("shows a Your Job section with Work/Raise/Quit actions when employed here", () => {
    atUniversity();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      const job = s.config.jobs.find((j) => j.locationId === "hiTechU")!;
      p.jobId = job.id;
      p.hoursRemaining = 10;
      return { state: s.state };
    });
    render(<UniversityScreen />);
    expect(screen.getByText("Your Job")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Request Raise")).toBeInTheDocument();
    expect(screen.getByText("Quit Job")).toBeInTheDocument();
  });

  it("does not show a Your Job section when not employed at Hi-Tech U", () => {
    atUniversity();
    render(<UniversityScreen />);
    expect(screen.queryByText("Your Job")).not.toBeInTheDocument();
  });

  it("quits the Hi-Tech U job when Quit Job is clicked", () => {
    atUniversity();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      const job = s.config.jobs.find((j) => j.locationId === "hiTechU")!;
      p.jobId = job.id;
      return { state: s.state };
    });
    render(<UniversityScreen />);
    fireEvent.click(screen.getByText("Quit Job"));
    expect(useGameStore.getState().state!.players[0].jobId).toBeNull();
  });
});

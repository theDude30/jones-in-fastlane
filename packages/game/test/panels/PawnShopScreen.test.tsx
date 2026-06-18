import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { PawnShopScreen } from "../../src/screens/panels/PawnShopScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atPawnShop() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "pawnShop";
    p.insideBuilding = true;
    p.cash = 1000;
    p.durables = [{ itemId: "stoveZMart", pricePaid: 490 }];
    return { state: s.state };
  });
}

describe("PawnShopScreen", () => {
  it("PAWN tab lists owned durables and pawns one on click", () => {
    atPawnShop();
    render(<PawnShopScreen />);
    expect(screen.getByText(/stoveZMart/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pawn")); // the only Pawn button — one durable owned
    const p = useGameStore.getState().state!.players[0];
    expect(p.durables.length).toBe(0);
    expect(p.cash).toBeGreaterThan(1000);
  });

  it("switches to the REDEEM tab and lists this player's pawned items", () => {
    atPawnShop();
    render(<PawnShopScreen />);
    fireEvent.click(screen.getByText("Pawn"));
    fireEvent.click(screen.getByText("REDEEM"));
    expect(screen.getByText(/stoveZMart/)).toBeInTheDocument();
  });
});

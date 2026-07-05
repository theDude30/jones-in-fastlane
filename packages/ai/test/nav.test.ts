import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { reduce } from "@jones/core";
import { navigateInto, goBuy } from "../src/nav.js";
import { solo } from "./testHelpers.js";

describe("navigateInto", () => {
  it("returns TravelTo when outside and at a different location", () => {
    const s = solo(defaultConfig);
    expect(navigateInto(s.players[0], "zMart", defaultConfig)).toEqual({ type: "TravelTo", locationId: "zMart" });
  });

  it("returns EnterBuilding once at the location but outside", () => {
    const s = solo(defaultConfig);
    const { state } = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig);
    expect(navigateInto(state.players[0], "zMart", defaultConfig)).toEqual({ type: "EnterBuilding" });
  });

  it("returns null once inside the target location", () => {
    const s = solo(defaultConfig);
    let state = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig).state;
    state = reduce(state, { type: "EnterBuilding" }, defaultConfig).state;
    expect(navigateInto(state.players[0], "zMart", defaultConfig)).toBeNull();
  });

  it("exits first when inside a different building than the target", () => {
    const s = solo(defaultConfig);
    let state = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig).state;
    state = reduce(state, { type: "EnterBuilding" }, defaultConfig).state;
    expect(navigateInto(state.players[0], "bank", defaultConfig)).toEqual({ type: "ExitBuilding" });
  });

  it("returns null when there aren't enough hours to travel", () => {
    const s = solo(defaultConfig);
    s.players[0].hoursRemaining = 0;
    expect(navigateInto(s.players[0], "bank", defaultConfig)).toBeNull();
  });
});

describe("goBuy", () => {
  it("navigates first, then buys once at the location and inside", () => {
    const s = solo(defaultConfig);
    let state = s;
    let cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "TravelTo", locationId: "zMart" });
    state = reduce(state, cmd!, defaultConfig).state;

    cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "EnterBuilding" });
    state = reduce(state, cmd!, defaultConfig).state;

    cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "BuyItem", itemId: "casualClothesZMart" });
  });
});

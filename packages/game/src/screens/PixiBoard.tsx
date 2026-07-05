import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { useGameStore } from "../store/gameStore.js";
import { BoardView } from "../board/BoardView.js";
import { resolveClick } from "../board/resolveClick.js";

export function PixiBoard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardViewRef = useRef<BoardView | null>(null);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Last-seen locationId per player, so AI turns (resolved synchronously,
  // with no per-move dispatch of their own) still get an animated glide to
  // wherever they ended up, the same as a human's click-triggered travel —
  // otherwise their token would just silently teleport between turns.
  const lastLocationsRef = useRef<Record<string, string>>({});
  // Survives across React 18 StrictMode's dev-only mount→unmount→remount of
  // this effect, so the second mount can wait for the first mount's
  // Application to be fully torn down before creating its own. Two
  // concurrently-live Pixi Applications (one mid-init/destroy, one starting
  // up) raced inside Pixi's WebGL batch renderer and intermittently threw
  // "Cannot read properties of null (reading 'geometry')" — serializing
  // their lifecycles eliminates the overlap entirely.
  const pendingCleanupRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let app: Application | undefined;
    let boardView: BoardView | null = null;
    let resizeObserver: ResizeObserver | null = null;

    function handleLocationClick(locationId: string) {
      const current = stateRef.current;
      if (!current) return;
      const player = current.players[current.currentPlayerIndex];
      const [command, followUp] = resolveClick(locationId, player);
      const fromLocationId = player.locationId;
      dispatch(command);
      if (command.type === "TravelTo") {
        boardViewRef.current?.playTravelAnimation(player.id, fromLocationId, locationId, () => {
          if (!followUp) return;
          // Only enter if travel actually landed the player here — if hours
          // ran out mid-way, TravelTo silently no-ops and dispatching
          // EnterBuilding here would wrongly enter wherever they still are.
          const arrived = useGameStore
            .getState()
            .state?.players.find((p) => p.id === player.id);
          if (arrived?.locationId === locationId && !arrived.insideBuilding) {
            dispatch(followUp);
          }
        });
      }
    }

    async function setup(containerEl: HTMLDivElement): Promise<void> {
      if (pendingCleanupRef.current) await pendingCleanupRef.current;
      if (cancelled) return;

      app = new Application();
      await app.init({
        resizeTo: containerEl,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        backgroundColor: "#f4f6f9",
      });
      if (cancelled) {
        app.destroy(true);
        app = undefined;
        return;
      }

      containerEl.appendChild(app.canvas);
      boardView = new BoardView(app.stage, handleLocationClick);
      boardViewRef.current = boardView;
      boardView.resize(containerEl.clientWidth, containerEl.clientHeight);
      if (stateRef.current) boardView.syncState(stateRef.current);

      resizeObserver = new ResizeObserver(() => {
        boardView?.resize(containerEl.clientWidth, containerEl.clientHeight);
      });
      resizeObserver.observe(containerEl);
    }

    const ready = setup(container);

    return () => {
      cancelled = true;
      const cleanup = ready.then(() => {
        resizeObserver?.disconnect();
        boardView?.destroy();
        app?.destroy(true);
        boardViewRef.current = null;
      });
      pendingCleanupRef.current = cleanup;
      cleanup.finally(() => {
        if (pendingCleanupRef.current === cleanup) pendingCleanupRef.current = null;
      });
    };
  }, [dispatch]);

  useEffect(() => {
    if (!state) return;
    const boardView = boardViewRef.current;
    for (const player of state.players) {
      const prevLocationId = lastLocationsRef.current[player.id];
      if (
        boardView &&
        prevLocationId &&
        prevLocationId !== player.locationId &&
        !boardView.isAnimating(player.id)
      ) {
        boardView.playTravelAnimation(player.id, prevLocationId, player.locationId, () => {});
      }
      lastLocationsRef.current[player.id] = player.locationId;
    }
    boardView?.syncState(state);
  }, [state]);

  return <div ref={containerRef} style={{ width: "100%", height: 360 }} />;
}

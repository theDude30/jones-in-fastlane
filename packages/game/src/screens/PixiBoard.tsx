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
      const command = resolveClick(locationId, player);
      const fromLocationId = player.locationId;
      dispatch(command);
      if (command.type === "TravelTo") {
        boardViewRef.current?.playTravelAnimation(player.id, fromLocationId, locationId, () => {});
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
    if (state) boardViewRef.current?.syncState(state);
  }, [state]);

  return <div ref={containerRef} style={{ width: "100%", height: 360 }} />;
}

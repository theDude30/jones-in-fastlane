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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let boardView: BoardView | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

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

    app
      .init({
        resizeTo: container,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        backgroundColor: "#f4f6f9",
      })
      .then(() => {
        if (cancelled) return;
        container.appendChild(app.canvas);
        boardView = new BoardView(app.stage, handleLocationClick);
        boardViewRef.current = boardView;
        boardView.resize(container.clientWidth, container.clientHeight);
        if (stateRef.current) boardView.syncState(stateRef.current);

        resizeObserver = new ResizeObserver(() => {
          boardView?.resize(container.clientWidth, container.clientHeight);
        });
        resizeObserver.observe(container);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      boardView?.destroy();
      app.destroy(true);
      boardViewRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (state) boardViewRef.current?.syncState(state);
  }, [state]);

  return <div ref={containerRef} style={{ width: "100%", height: 360 }} />;
}

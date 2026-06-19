import { useGameStore } from "../../store/gameStore.js";

export function UniversityScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];

  return (
    <section>
      <h2>Hi-Tech University</h2>
      <ul>
        {config.degrees.map((degree) => {
          const owned = p.degrees.includes(degree.id);
          const enrollment = p.enrollments.find((e) => e.degreeId === degree.id);
          const prereqsMet = degree.prereqs.every((pr) => p.degrees.includes(pr));
          return (
            <li key={degree.id}>
              {degree.name}
              {owned && " (graduated)"}
              {enrollment && ` (${enrollment.lessonsRemaining} lessons left)`}
              {!owned && !enrollment && prereqsMet && (
                <button onClick={() => dispatch({ type: "Enroll", degreeId: degree.id })}>Enroll</button>
              )}
              {enrollment && (
                <button onClick={() => dispatch({ type: "Study", degreeId: degree.id })}>Study</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

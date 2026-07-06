import { useEffect, useState } from "react";
import { makeEconomy } from "@jones/core";
import type { DegreeId } from "@jones/config";
import { useGameStore } from "../../store/gameStore.js";
import "./UniversityScreen.css";

const ACTION_MESSAGE_MS = 2600;

export function UniversityScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), ACTION_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [actionError]);

  if (!state) return null;
  const p = state.players[state.currentPlayerIndex];
  const economy = makeEconomy(config);
  const fee = economy.adjustedPrice(config.constants.enrollmentBaseFee, state.economy.reading);

  function leave() {
    dispatch({ type: "ExitBuilding" });
  }

  function handleEnroll(degreeId: DegreeId) {
    dispatch({ type: "Enroll", degreeId });
    const events = useGameStore.getState().lastEvents;
    const notEnoughMoney = events.find((e) => e.type === "NotEnoughMoney" && e.action === "Enroll");
    const invalid = events.find((e) => e.type === "InvalidAction");
    if (notEnoughMoney) {
      setActionError(`Not enough cash — enrollment costs $${fee.toFixed(0)}.`);
    } else if (invalid && invalid.type === "InvalidAction" && invalid.reason === "max enrollments") {
      setActionError(`You can only be enrolled in ${config.constants.maxEnrollments} courses at once.`);
    }
  }

  function handleStudy(degreeId: DegreeId) {
    dispatch({ type: "Study", degreeId });
    const events = useGameStore.getState().lastEvents;
    const noTime = events.find((e) => e.type === "NotEnoughTime" && e.action === "Study");
    if (noTime) {
      setActionError("Not enough hours left today to study.");
    }
  }

  const inProgress = config.degrees.filter((d) => p.enrollments.some((e) => e.degreeId === d.id));
  const completed = config.degrees.filter((d) => p.degrees.includes(d.id));
  const available = config.degrees.filter(
    (d) =>
      !p.degrees.includes(d.id) &&
      !p.enrollments.some((e) => e.degreeId === d.id) &&
      d.prereqs.every((pr) => p.degrees.includes(pr)),
  );
  // Degrees whose prereqs aren't met yet are simply left out of every list
  // above — they're not offerable, so the tablet doesn't show them at all.

  return (
    <div className="ht-overlay">
      <div className="ht-tablet">
        <div className="ht-camera" aria-hidden="true" />
        <div className="ht-screen">
          <header className="ht-header">
            <h2 className="ht-title">Hi-Tech U</h2>
            <button className="ht-leave" onClick={leave}>
              Leave
            </button>
          </header>

          {actionError && <p className="ht-error">{actionError}</p>}

          <div className="ht-body">
            {inProgress.length > 0 && (
              <section className="ht-section">
                <h3 className="ht-section-title">In Progress</h3>
                <ul className="ht-list">
                  {inProgress.map((degree) => {
                    const enrollment = p.enrollments.find((e) => e.degreeId === degree.id)!;
                    const total = Math.max(
                      config.constants.minLessonsPerDegree,
                      config.constants.lessonsPerDegree - p.extraCredit,
                    );
                    const done = Math.max(0, total - enrollment.lessonsRemaining);
                    const pct = Math.min(100, Math.round((done / total) * 100));
                    return (
                      <li key={degree.id} className="ht-card">
                        <div className="ht-card-row">
                          <span className="ht-card-name">{degree.name}</span>
                          <span className="ht-card-meta">{enrollment.lessonsRemaining} lessons left</span>
                        </div>
                        <div className="ht-progress-track">
                          <div className="ht-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <button className="ht-action" onClick={() => handleStudy(degree.id)}>
                          Study
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {available.length > 0 && (
              <section className="ht-section">
                <h3 className="ht-section-title">Available Courses</h3>
                <ul className="ht-list">
                  {available.map((degree) => (
                    <li key={degree.id} className="ht-card">
                      <div className="ht-card-row">
                        <span className="ht-card-name">{degree.name}</span>
                        <span className="ht-card-meta">${fee.toFixed(0)}</span>
                      </div>
                      <button className="ht-action ht-action--outline" onClick={() => handleEnroll(degree.id)}>
                        Enroll
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {completed.length > 0 && (
              <section className="ht-section">
                <h3 className="ht-section-title">Completed</h3>
                <div className="ht-badges">
                  {completed.map((degree) => (
                    <span key={degree.id} className="ht-badge">
                      ✓ {degree.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
        <div className="ht-home-bar" aria-hidden="true" />
      </div>
    </div>
  );
}

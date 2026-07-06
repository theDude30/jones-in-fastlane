import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { makeEconomy } from "@jones/core";
import type { PlayerState } from "@jones/core";
import type { JobDef } from "@jones/config";
import { useGameStore } from "../../store/gameStore.js";
import "./EmploymentOfficeScreen.css";

const CONFETTI_COLORS = ["#0a66c2", "#e0524a", "#2eb872", "#caa12e", "#ffffff"];
const CONFETTI_PIECE_COUNT = 60;
// How long a hire/reject reaction (manager mood, confetti, red flash, and
// the outcome message) stays up before resetting to neutral on its own —
// otherwise it only ever cleared on navigation (switching company or going
// back), so leaving it showing and then coming back to the same job list
// left the reaction frozen there indefinitely.
const OUTCOME_DISPLAY_MS = 2600;

/** A one-shot confetti burst covering the whole panel, not just the manager
 * portrait — remounted (via the parent's `key`) every time a hire lands, so
 * repeat hires replay the burst instead of the animation staying frozen at
 * its end state. */
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_PIECE_COUNT }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotate: Math.random() * 360,
        drift: (Math.random() - 0.5) * 140,
      })),
    [],
  );
  return (
    <div className="eo-confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="eo-confetti-piece"
          style={
            {
              left: `${piece.left}%`,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              backgroundColor: piece.color,
              transform: `rotate(${piece.rotate}deg)`,
              "--eo-confetti-drift": `${piece.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** A brief red flash across the whole panel on a rejection. */
function RejectFlash() {
  return <div className="eo-reject-flash" aria-hidden="true" />;
}

type Outcome =
  | { jobId: string; status: "hired"; wage: number }
  | { jobId: string; status: "rejected"; reasons: string[] }
  | { jobId: string; status: "no-time" };

type ManagerMood = "neutral" | "hired" | "rejected";

const MANAGER_MEDIA: Record<ManagerMood, { src: string; video: boolean }> = {
  neutral: { src: "/board/hr-manager-neutral.png", video: false },
  hired: { src: "/board/hr-manager-happy.mp4", video: true },
  rejected: { src: "/board/hr-manager-sad.mp4", video: true },
};

/** Requirements the player currently falls short of — drives both the
 * red/green requirement pills on each job card and the rejection reason. */
function unmetRequirements(
  job: JobDef,
  p: PlayerState,
  depGateActive: boolean,
  degreeName: (id: string) => string,
): string[] {
  const reasons: string[] = [];
  if (p.experience < job.reqExperience) {
    reasons.push(`needs ${job.reqExperience} experience (you have ${p.experience})`);
  }
  if (depGateActive && p.dependibility < job.reqDependibility) {
    reasons.push(`needs ${job.reqDependibility} dependability (you have ${p.dependibility})`);
  }
  const missingDegrees = job.reqDegrees.filter((d) => !p.degrees.includes(d));
  if (missingDegrees.length > 0) {
    reasons.push(`requires ${missingDegrees.map(degreeName).join(", ")}`);
  }
  return reasons;
}

function ManagerPanel({ mood }: { mood: ManagerMood }) {
  const media = MANAGER_MEDIA[mood];
  return (
    <aside className="eo-manager">
      {media.video ? (
        <video
          key={media.src}
          className="eo-manager-media"
          src={media.src}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        <img key={media.src} className="eo-manager-media" src={media.src} alt="Hiring manager" />
      )}
    </aside>
  );
}

export function EmploymentOfficeScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [selectedEmployerId, setSelectedEmployerId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Bumped on every applied outcome so the confetti/flash overlays remount
  // (and thus replay their animation) even when the same job is re-applied
  // to with the same result — a plain outcome object with unchanged fields
  // wouldn't otherwise give React a reason to re-key the effect.
  const [outcomeSeq, setOutcomeSeq] = useState(0);

  useEffect(() => {
    if (outcomeSeq === 0) return;
    const timer = setTimeout(() => setOutcome(null), OUTCOME_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [outcomeSeq]);

  if (!state) return null;
  const currentPlayerIndex = state.currentPlayerIndex;
  const p = state.players[currentPlayerIndex];
  const economy = makeEconomy(config);
  const depGateActive = state.week > 4;
  const degreeName = (id: string) => config.degrees.find((d) => d.id === id)?.name ?? id;

  const employers = config.locations.filter((loc) => loc.types.includes("workplace"));
  const jobCount = (employerId: string) => config.jobs.filter((j) => j.locationId === employerId).length;

  function selectEmployer(employerId: string) {
    setSelectedEmployerId(employerId);
    setOutcome(null);
  }

  function backToCompanies() {
    setSelectedEmployerId(null);
    setOutcome(null);
  }

  function leave() {
    dispatch({ type: "ExitBuilding" });
  }

  function handleApply(job: JobDef) {
    dispatch({ type: "ApplyForJob", jobId: job.id });
    const events = useGameStore.getState().lastEvents;
    const applied = events.find((e) => e.type === "JobApplied" && e.jobId === job.id);
    const denied = events.find((e) => e.type === "JobDenied" && e.jobId === job.id);
    const noTime = events.find((e) => e.type === "NotEnoughTime" && e.action === "ApplyForJob");
    const freshPlayer = useGameStore.getState().state!.players[currentPlayerIndex];

    if (applied && applied.type === "JobApplied") {
      setOutcome({ jobId: job.id, status: "hired", wage: applied.wage });
      setOutcomeSeq((n) => n + 1);
    } else if (denied && denied.type === "JobDenied") {
      const reasons =
        denied.reason === "stats"
          ? unmetRequirements(job, freshPlayer, depGateActive, degreeName)
          : ["didn't get the offer this time — the odds aren't guaranteed, feel free to try again"];
      setOutcome({ jobId: job.id, status: "rejected", reasons });
      setOutcomeSeq((n) => n + 1);
    } else if (noTime) {
      setOutcome({ jobId: job.id, status: "no-time" });
      setOutcomeSeq((n) => n + 1);
    }
  }

  const selectedEmployer = employers.find((e) => e.id === selectedEmployerId) ?? null;
  const managerMood: ManagerMood =
    outcome?.status === "hired" ? "hired" : outcome?.status === "rejected" ? "rejected" : "neutral";

  return (
    <div className="eo-overlay">
      <header className="eo-header">
        <h2 className="eo-title">Employment Office</h2>
        <button className="eo-leave" onClick={leave}>
          Leave
        </button>
      </header>

      <div className="eo-main">
        <div className="eo-menu">
          {selectedEmployer === null ? (
            <ul className="eo-company-list">
              {employers.map((employer) => (
                <li key={employer.id}>
                  <button className="eo-company-card" onClick={() => selectEmployer(employer.id)}>
                    <span className="eo-avatar">{employer.name.charAt(0)}</span>
                    <span className="eo-company-info">
                      <span className="eo-company-name">{employer.name}</span>
                      <span className="eo-company-sub">{jobCount(employer.id)} open positions</span>
                    </span>
                    <span className="eo-chevron">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <button className="eo-back" onClick={backToCompanies}>
                ‹ Companies
              </button>
              <h3 className="eo-company-title">{selectedEmployer.name}</h3>
              <ul className="eo-job-list">
                {config.jobs
                  .filter((job) => job.locationId === selectedEmployer.id)
                  .map((job) => {
                    const wage = economy.adjustedPrice(job.baseWage, state.economy.reading);
                    const reqs = unmetRequirements(job, p, depGateActive, degreeName);
                    const isCurrentJob = p.jobId === job.id;
                    const jobOutcome = outcome && outcome.jobId === job.id ? outcome : null;
                    return (
                      <li key={job.id} className="eo-job-card">
                        <div className="eo-job-main">
                          <span className="eo-job-title">{job.title}</span>
                          <span className="eo-job-wage">${wage.toFixed(2)}/hr</span>
                        </div>
                        <div className="eo-job-reqs">
                          <span className={`eo-pill ${reqs.length === 0 ? "eo-pill--met" : "eo-pill--unmet"}`}>
                            Exp {job.reqExperience}+
                          </span>
                          {job.reqDegrees.map((d) => (
                            <span
                              key={d}
                              className={`eo-pill ${p.degrees.includes(d) ? "eo-pill--met" : "eo-pill--unmet"}`}
                            >
                              {degreeName(d)}
                            </span>
                          ))}
                        </div>
                        {jobOutcome && (
                          <p className={`eo-outcome eo-outcome--${jobOutcome.status}`}>
                            {jobOutcome.status === "hired" &&
                              `HIRED! You're now the ${job.title} — $${jobOutcome.wage.toFixed(2)}/hr.`}
                            {jobOutcome.status === "rejected" && `REJECTED — ${jobOutcome.reasons.join("; ")}.`}
                            {jobOutcome.status === "no-time" && "Not enough hours left today to apply."}
                          </p>
                        )}
                        {isCurrentJob ? (
                          <span className="eo-current-job">Current job</span>
                        ) : (
                          <button className="eo-apply" onClick={() => handleApply(job)}>
                            Apply
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
        <ManagerPanel mood={managerMood} />
      </div>
      {managerMood === "hired" && <ConfettiBurst key={outcomeSeq} />}
      {managerMood === "rejected" && <RejectFlash key={outcomeSeq} />}
    </div>
  );
}

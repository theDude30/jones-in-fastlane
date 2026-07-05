import { useState } from "react";
import { makeEconomy } from "@jones/core";
import type { PlayerState } from "@jones/core";
import type { JobDef } from "@jones/config";
import { useGameStore } from "../../store/gameStore.js";
import "./EmploymentOfficeScreen.css";

type Outcome =
  | { jobId: string; status: "hired"; wage: number }
  | { jobId: string; status: "rejected"; reasons: string[] }
  | { jobId: string; status: "no-time" };

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

export function EmploymentOfficeScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [selectedEmployerId, setSelectedEmployerId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

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
    } else if (denied && denied.type === "JobDenied") {
      const reasons =
        denied.reason === "stats"
          ? unmetRequirements(job, freshPlayer, depGateActive, degreeName)
          : ["didn't get the offer this time — the odds aren't guaranteed, feel free to try again"];
      setOutcome({ jobId: job.id, status: "rejected", reasons });
    } else if (noTime) {
      setOutcome({ jobId: job.id, status: "no-time" });
    }
  }

  const selectedEmployer = employers.find((e) => e.id === selectedEmployerId) ?? null;

  return (
    <div className="eo-overlay">
      <header className="eo-header">
        <h2 className="eo-title">Employment Office</h2>
        <button className="eo-leave" onClick={leave}>
          Leave
        </button>
      </header>

      <div className="eo-body">
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
                          {jobOutcome.status === "hired" && `HIRED! You're now the ${job.title} — $${jobOutcome.wage.toFixed(2)}/hr.`}
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
    </div>
  );
}

import { useState } from "react";
import { useGameStore } from "../../store/gameStore.js";

export function EmploymentOfficeScreen() {
  const config = useGameStore((s) => s.config);
  const dispatch = useGameStore((s) => s.dispatch);
  const [selectedEmployer, setSelectedEmployer] = useState<string | null>(null);

  const employers = config.locations.filter((loc) => loc.types.includes("workplace"));

  if (selectedEmployer === null) {
    return (
      <section>
        <h2>Employment Office</h2>
        <ul>
          {employers.map((employer) => (
            <li key={employer.id}>
              <button onClick={() => setSelectedEmployer(employer.id)}>{employer.name}</button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const jobs = config.jobs.filter((job) => job.locationId === selectedEmployer);

  return (
    <section>
      <h2>{employers.find((e) => e.id === selectedEmployer)?.name} jobs</h2>
      <button onClick={() => setSelectedEmployer(null)}>Back</button>
      <ul>
        {jobs.map((job) => (
          <li key={job.id}>
            {job.title} — ${job.baseWage}/hr{" "}
            <button onClick={() => dispatch({ type: "ApplyForJob", jobId: job.id })}>Apply</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

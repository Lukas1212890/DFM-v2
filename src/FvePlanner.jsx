import React from "react";
import "./fve-planner.css";

const PLANNER_URL = "https://fve-planovac.bednarik.workers.dev/";

export default function FvePlanner() {
  return (
    <section className="fve-embedded-page" aria-label="Plánovač inspekcí FVE">
      <iframe
        className="fve-embedded-frame"
        src={PLANNER_URL}
        title="Plánovač inspekcí FVE"
        allow="clipboard-read; clipboard-write; geolocation"
      />
      <a
        className="fve-embedded-open"
        href={PLANNER_URL}
        target="_blank"
        rel="noreferrer"
      >
        Otevřít Plánovač samostatně ↗
      </a>
    </section>
  );
}

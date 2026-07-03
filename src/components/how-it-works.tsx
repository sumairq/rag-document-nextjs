import { Fragment } from "react";

import { ChevronDownIcon } from "@/components/ui/icons";

/** Three-step orientation for first-time visitors. Shared by the chat welcome
 * state and the empty-corpus state. Kept deliberately lightweight — a single
 * muted line — so it never competes with the primary content around it. */
const STEPS = [
  "Point it at your documents",
  "Ask a question",
  "Get answers with sources you can open",
];

export function HowItWorks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[13px] font-medium text-muted">
      {STEPS.map((step, i) => (
        <Fragment key={step}>
          {i > 0 && (
            <ChevronDownIcon
              width={13}
              height={13}
              className="shrink-0 -rotate-90 text-faint"
            />
          )}
          <span>{step}</span>
        </Fragment>
      ))}
    </div>
  );
}

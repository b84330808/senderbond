// The demo can't mail 1,000 real people, so most of the list is a clearly
// labelled simulation. The few "live" demo inboxes are real: every click a
// judge makes in the Inbox screen is counted on top of the simulated crowd.

export const WINDOW_HOURS = 72;

export const AUDIENCES = {
  opted_in: {
    label: "Opted-in subscribers",
    complaint: 0.0004,
    unsubscribe: 0.004,
    open: 0.38,
  },
  scraped: {
    label: "Scraped / purchased list",
    complaint: 0.0085,
    unsubscribe: 0.025,
    open: 0.09,
  },
} as const;
export type Audience = keyof typeof AUDIENCES;

// Most reactions happen in the first day; normalised so the curve hits 1 at 72h.
function curve(hours: number) {
  const h = Math.min(Math.max(hours, 0), WINDOW_HOURS);
  return (1 - Math.exp(-h / 14)) / (1 - Math.exp(-WINDOW_HOURS / 14));
}

export function simulatedCounts(audience: Audience, simulatedRecipients: number, hours: number) {
  const profile = AUDIENCES[audience];
  const f = curve(hours);
  return {
    recipients: simulatedRecipients,
    opens: Math.floor(simulatedRecipients * profile.open * f),
    unsubscribes: Math.floor(simulatedRecipients * profile.unsubscribe * f),
    complaints: Math.floor(simulatedRecipients * profile.complaint * f),
  };
}

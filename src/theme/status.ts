import { colors } from "./tokens";

/**
 * Trip status presentation (M2).
 *
 * Labels are the exact strings from docs/06 §5 "Status values shown in the
 * app" — the driver app and the web console show different wording for the
 * same database status. Every chip is text + colour + icon, never colour
 * alone (DESIGN.md).
 */
export type TripStatus =
  "assigned" | "in_progress" | "completed" | "verified" | "needs_review" | "rejected" | "cancelled";

/** Visual treatment of a status chip (DESIGN.md status chips). */
export type StatusVariant =
  "outlined" | "live" | "verifying" | "verified" | "review" | "rejected" | "neutral";

export type StatusMeta = {
  /** Database enum value (supabase migrations). */
  status: TripStatus;
  /** Driver-app label (docs/06 §5). */
  driverLabel: string;
  /** Ops-console label (docs/06 §5). */
  consoleLabel: string;
  /** Chip treatment. */
  variant: StatusVariant;
  /** Chip foreground/accent colour token value. */
  color: string;
  /** Material Symbols ligature name. */
  icon: string;
  /** Live chips pulse (DESIGN.md: "Live (blue, pulsing dot)"). */
  pulse: boolean;
};

export const TRIP_STATUS: Record<TripStatus, StatusMeta> = {
  assigned: {
    status: "assigned",
    driverLabel: "Ready to start",
    consoleLabel: "Assigned",
    variant: "outlined",
    color: colors.primary,
    icon: "play_circle",
    pulse: false,
  },
  in_progress: {
    status: "in_progress",
    driverLabel: "Trip in progress",
    consoleLabel: "Live",
    variant: "live",
    color: colors.live,
    icon: "trip_origin",
    pulse: true,
  },
  completed: {
    status: "completed",
    driverLabel: "Verifying…",
    consoleLabel: "Awaiting data",
    variant: "verifying",
    color: colors.neutral,
    icon: "hourglass_top",
    pulse: false,
  },
  verified: {
    status: "verified",
    driverLabel: "Verified ✅",
    consoleLabel: "Verified",
    variant: "verified",
    color: colors.verified,
    icon: "check_circle",
    pulse: false,
  },
  needs_review: {
    status: "needs_review",
    driverLabel: "Under review",
    consoleLabel: "Needs review",
    variant: "review",
    color: colors.review,
    icon: "warning",
    pulse: false,
  },
  rejected: {
    status: "rejected",
    driverLabel: "Not verified",
    consoleLabel: "Rejected",
    variant: "rejected",
    color: colors.rejected,
    icon: "cancel",
    pulse: false,
  },
  cancelled: {
    status: "cancelled",
    driverLabel: "Cancelled",
    consoleLabel: "Cancelled",
    variant: "neutral",
    color: colors.neutral,
    icon: "block",
    pulse: false,
  },
};

export const tripStatusList: StatusMeta[] = Object.values(TRIP_STATUS);

export function tripStatusMeta(status: TripStatus): StatusMeta {
  return TRIP_STATUS[status];
}

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("remove expired stories", { minuteUTC: 7 }, internal.stories.cleanupExpired);
crons.daily(
  "sweep orphan uploads",
  { hourUTC: 3, minuteUTC: 17 },
  internal.files.sweepOrphans,
);
crons.daily(
  "purge relay queue",
  { hourUTC: 3, minuteUTC: 47 },
  internal.relay.purgeExpired,
);
crons.hourly(
  "purge expired call signals",
  { minuteUTC: 23 },
  internal.calls.purgeExpired,
);

export default crons;

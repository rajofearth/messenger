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

export default crons;

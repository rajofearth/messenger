import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("remove expired stories", { minuteUTC: 7 }, internal.stories.cleanupExpired);

export default crons;

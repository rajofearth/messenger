import { defineApp } from "convex/server";
import chat from "convex-chat/convex.config.js";

const app = defineApp();
app.use(chat);

export default app;

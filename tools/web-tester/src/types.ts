import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

export type Profile = NonNullable<FunctionReturnType<typeof api.profiles.me>>;
export type ChatSummary = FunctionReturnType<typeof api.chat.listInbox>[number];
export type Message = FunctionReturnType<typeof api.chat.listMessages>[number];

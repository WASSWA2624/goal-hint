import { z } from "zod";

export const contentAccessSchema = z.strictObject({ tier: z.enum(["full", "free"]), signedIn: z.boolean() });

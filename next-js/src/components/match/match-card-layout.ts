"use client";

import { createContext } from "react";

/** One media subscription per list selects the same presentation for every card. */
export const MatchCardLayoutContext = createContext(false);

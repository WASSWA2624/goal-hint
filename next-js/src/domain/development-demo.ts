/** This expression is replaced consistently in the browser and server by Next.
 * A production build can never enable demo data through an environment flag. */
const developmentDemo = process.env.NODE_ENV === "development"
  && process.env.NEXT_PUBLIC_GOAL_HINT_DEMO !== "false";

type DemoEnvironment = Readonly<Record<string, string | undefined>>;

export function isDevelopmentDemo(environment?: DemoEnvironment): boolean {
  return environment ? environment.NODE_ENV === "development"
    && environment.NEXT_PUBLIC_GOAL_HINT_DEMO !== "false" : developmentDemo;
}

/** The isolated live-data launcher binds its web server to loopback. */
export function isLocalFootballDevelopment(): boolean {
  return process.env.NODE_ENV === "development"
    && process.env.NEXT_PUBLIC_GOAL_HINT_DEMO === "false"
    && process.env.NEXT_PUBLIC_GOAL_HINT_LOCAL_FOOTBALL === "true";
}

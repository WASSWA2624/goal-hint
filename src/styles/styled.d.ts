import "styled-components";
import type { GoalHintTheme } from "./theme";

declare module "styled-components" {
  // styled-components exposes the augmented theme to every shared primitive.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends GoalHintTheme {}
}

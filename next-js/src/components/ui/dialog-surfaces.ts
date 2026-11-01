import { css } from "styled-components";

/** Modal bodies share the white light-theme canvas and retain their dark surfaces. */
export const dialogSurface = css`
  background: ${({ theme }) => theme.mode === "light" ? theme.textField.background : theme.color.surface};
`;

/** Filter editors retain their existing dark panel tint. */
export const filterDialogSurface = css`
  ${dialogSurface}
  ${({ theme }) => theme.mode === "dark" && css`background: var(--filter-panel-background, ${theme.color.surface});`}
`;

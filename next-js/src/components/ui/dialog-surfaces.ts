import { css } from "styled-components";

/** Modal bodies share the white light-theme canvas and retain their dark surfaces. */
export const dialogSurface = css`
  background: ${({ theme }) => theme.color.surface};
`;

export const dialogHeaderSurface = css`
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.dialog.headerBackground};
`;

export const dialogFooterSurface = css`
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.dialog.footerBackground};
`;

/** Filter bodies share the content canvas; headers and footers provide separation. */
export const filterDialogSurface = dialogSurface;

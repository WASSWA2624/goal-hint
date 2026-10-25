import { Fragment, type ReactNode } from "react";

/** Fills `{name}` placeholders with rich values, so sentences keep their values bold without splitting the copy. */
export function richText(template: string, values: Readonly<Record<string, ReactNode>>): ReactNode {
  return template.split(/\{(\w+)\}/u).map((part, index) => <Fragment key={index}>{index % 2 ? values[part] ?? `{${part}}` : part}</Fragment>);
}

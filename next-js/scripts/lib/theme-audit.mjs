import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/u.test(file) ? [file] : [];
  });
}

const styledTemplate = node => ts.isTaggedTemplateExpression(node)
  && /^(?:styled(?:\.|\(|<)|css(?:<|$)|createGlobalStyle|keyframes)/u.test(node.tag.getText());

/** Visit actual CSS and JSX style values, without treating dates, messages or SVG paths as CSS. */
export function visualValues(source, file = "sample.tsx") {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const values = [];
  const record = (node, value, kind = "css") => values.push({ value, kind,
    line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1 });
  const insideStyle = node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (styledTemplate(parent)) return true;
    return false;
  };
  const insideInlineStyle = node => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isJsxAttribute(parent) && parent.name.getText(tree) === "style") return true;
      if (ts.isPropertyAssignment(parent) && parent.name.getText(tree) === "style") return true;
    }
    return false;
  };
  const visit = node => {
    if (styledTemplate(node)) {
      const template = node.template;
      if (ts.isNoSubstitutionTemplateLiteral(template)) record(template, template.text);
      else {
        record(template.head, template.head.text);
        template.templateSpans.forEach(span => record(span.literal, span.literal.text));
      }
    }
    if (ts.isStringLiteral(node) && insideStyle(node)) record(node, node.text);
    else if (ts.isStringLiteral(node) && !insideInlineStyle(node) && /(?:\d(?:px|rem|em|ch)\b|#[\da-f]{3,8}\b)/iu.test(node.text)) {
      const attribute = ts.isJsxAttribute(node.parent) ? node.parent.name.getText(tree) : "";
      // SVG coordinate systems and image-loading distance are behavioral geometry.
      if (!["width", "height", "dy", "dx"].includes(attribute) && !file.endsWith("deferred-image.ts")) record(node, node.text);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === "style" && node.initializer && ts.isJsxExpression(node.initializer)) {
      let expression = node.initializer.expression;
      if (expression && ts.isAsExpression(expression)) expression = expression.expression;
      if (expression && ts.isObjectLiteralExpression(expression)) for (const property of expression.properties) {
        if (!ts.isPropertyAssignment(property) || property.name.getText(tree).startsWith('"--')) continue;
        const name = property.name.getText(tree).replaceAll(/["']/gu, "").replaceAll(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`);
        const value = property.initializer;
        if (ts.isStringLiteral(value) || ts.isNumericLiteral(value)) record(property, `${name}: ${value.text};`, "inline");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return values;
}

export function hardcodedVisuals(source, file) {
  return visualValues(source, file).flatMap(({ value, kind, line }) => {
    const css = value.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
    const literals = css.match(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*\d|(?<![\w.-])-?(?:\d*\.)?\d+(?:px|rem|em|ch|ms|s)\b|(?:font-weight|line-height|z-index|opacity)\s*:\s*(?![01](?:\s*[;}!]|$))-?(?:\d*\.)?\d+(?![\w.])/giu) ?? [];
    literals.push(...(css.match(/font-weight:\s*(?:normal|bold|bolder|lighter)\b|font-family:\s*(?:ui-monospace|Arial|sans-serif|serif|monospace)\b/gu) ?? []));
    if (kind === "inline") {
      const dimensions = css.match(/(?:gap|padding[\w-]*|margin[\w-]*|(?:min-|max-)?(?:width|height|inline-size|block-size)|font-size)\s*:\s*(?!0\s*;)(?:\d*\.)?\d+\s*;/gu) ?? [];
      literals.push(...dimensions);
    }
    return literals.filter(literal => !/^0(?:px|rem|em|ch|ms|s)$/u.test(literal)).map(literal => ({ line, literal, kind }));
  });
}

export function auditThemeSources(root) {
  return ["app", "components", "styles"].flatMap(directory => sourceFiles(path.join(root, directory))).flatMap(file => {
    // Theme definitions own the literal defaults; historical design catalogs own their review directions.
    if (/theme-(?:foundation|presets|tokens)\.ts$/u.test(file) || /(?:^|[\\/])designs\.ts$/u.test(file)) return [];
    return hardcodedVisuals(fs.readFileSync(file, "utf8"), file).map(finding => ({ file, ...finding }));
  });
}

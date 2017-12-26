/**
 * Automatically flattens arrays in template string.
 * Strips null / undefined / false.
 * Trims result.
 */
export function render(strings: TemplateStringsArray, ...values: any[]) {
  return String.raw(strings, ...values.map(renderValue)).trim();
}

function renderValue(value: any): string {
  if (value == null || value === false) {
    return '';
  }

  if (Array.isArray(value)) {
    const strings: string[] = [];
    let hasMultiline = false;

    for (const element of value) {
      const rendered = renderValue(element);

      if (!hasMultiline && rendered.includes('\n')) {
        hasMultiline = true;
      }

      strings.push(rendered);
    }

    return hasMultiline ? strings.join('\n\n') : strings.join('\n');
  }

  return value.toString();
}
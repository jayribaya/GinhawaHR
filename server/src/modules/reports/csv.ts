export function safeCell(value: string) {
  return /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}
export const csv = (rows: string[][]) =>
  "\uFEFF" +
  rows
    .map((row) =>
      row
        .map((value) => '"' + safeCell(value).replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\r\n");

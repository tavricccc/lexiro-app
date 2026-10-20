const LINK_PATH = /\/app\/shared\/([\w-]+)/u;
const BARE_ID = /^[\w-]{6,}$/u;

/** The share id in a pasted link (…/app/shared/<id>) or in a bare id. */
export function parseShareId(text: string): string | null {
  const value = text.trim();
  return value.match(LINK_PATH)?.[1] ?? (BARE_ID.test(value) ? value : null);
}

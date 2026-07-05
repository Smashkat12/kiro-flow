/**
 * Minimal YAML frontmatter parser covering the shapes that actually occur in
 * ruflo's .claude/agents/**\/*.md corpus (verified July 2026, v3.23.0):
 *   - plain `key: value` scalars (values may contain colons, HTML, anything)
 *   - `key: |` / `key: >` block scalars (used by description)
 *   - comma-separated single-line lists (tools)
 * Deliberately NOT a general YAML parser — anything unrecognized is kept
 * verbatim as a string so the converter can flag it instead of guessing.
 */

const FENCE = /^---\s*$/;

/**
 * @param {string} text full file contents
 * @returns {{attrs: Record<string,string>, body: string, hasFrontmatter: boolean}}
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!FENCE.test(lines[0] ?? '')) {
    return { attrs: {}, body: text, hasFrontmatter: false };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) { end = i; break; }
  }
  if (end === -1) return { attrs: {}, body: text, hasFrontmatter: false };

  const attrs = {};
  let i = 1;
  while (i < end) {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) { i++; continue; }
    const key = m[1];
    let value = m[2].trim();
    if (value === '|' || value === '>' || value === '') {
      // block scalar (or empty): consume following more-indented lines
      const block = [];
      let j = i + 1;
      while (j < end && (/^\s+\S/.test(lines[j]) || lines[j].trim() === '')) {
        block.push(lines[j].trim());
        j++;
      }
      if (block.length > 0) {
        value = block.join(value === '|' ? '\n' : ' ').trim();
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
    attrs[key] = value;
  }
  const body = lines.slice(end + 1).join('\n').replace(/^\n+/, '');
  return { attrs, body, hasFrontmatter: true };
}

/** Split a comma-separated tools frontmatter value into trimmed names. */
export function parseToolList(value) {
  if (!value) return [];
  return value.split(',').map((t) => t.trim()).filter(Boolean);
}

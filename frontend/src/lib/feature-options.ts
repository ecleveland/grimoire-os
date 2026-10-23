/**
 * Splits the option list off a feature description, so a feature such as
 * Eldritch Invocations or Metamagic can show its options as a group instead of
 * a long run of paragraphs.
 *
 * The list starts at a line holding only `**Options**`. Each option then starts
 * at a line holding only `**Name**`, may open with a `Prerequisite:` or `Cost:`
 * paragraph, and runs until the next name line. Both patterns match the
 * backend's, in printable-cards.service.ts (OPTIONS_HEADING) and
 * srd-json.loader.ts (BOLD_NAME_LINE), and must change with them.
 */

export interface FeatureOption {
  name: string;
  /** The Prerequisite or Cost paragraph, label included. */
  meta?: string;
  /** The option's own markdown, or '' when it has none. */
  description: string;
}

export interface SplitFeature {
  body: string;
  options: FeatureOption[];
}

const OPTIONS_MARKER = /^\s*\*\*Options\*\*\s*$/;
const NAME_LINE = /^\*\*([^*]+)\*\*$/;
const META_PARAGRAPH = /^(Prerequisite|Cost):/;

function toOption(name: string, lines: string[]): FeatureOption {
  const paragraphs = lines
    .join('\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p !== '');
  const meta = paragraphs[0] !== undefined && META_PARAGRAPH.test(paragraphs[0]);
  const description = (meta ? paragraphs.slice(1) : paragraphs).join('\n\n');
  return meta ? { name, meta: paragraphs[0], description } : { name, description };
}

/**
 * Returns the description before the marker as `body` and one entry per
 * option. Text between the marker and the first option, such as "Choose from
 * the list below.", joins the body. A description with no marker, or with no
 * name line after it, comes back whole with no options, so a homebrew feature
 * that only mentions options still renders as plain markdown.
 */
export function splitFeatureOptions(description: string): SplitFeature {
  const lines = description.split('\n');
  const marker = lines.findIndex(line => OPTIONS_MARKER.test(line));
  if (marker === -1) return { body: description, options: [] };

  const intro: string[] = [];
  const options: FeatureOption[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of lines.slice(marker + 1)) {
    // A second marker line is text, as the backend's option names leave it out.
    const name = OPTIONS_MARKER.test(line) ? null : NAME_LINE.exec(line.trim());
    if (name) {
      if (current) options.push(toOption(current.name, current.lines));
      current = { name: name[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  }
  if (!current) return { body: description, options: [] };
  options.push(toOption(current.name, current.lines));

  // Blank lines are trimmed off, but not a first line's indent, which markdown
  // reads as a code block.
  const before = lines.slice(0, marker).join('\n').trimEnd();
  const after = intro
    .join('\n')
    .replace(/^\s*\n/, '')
    .trimEnd();
  const body = [before, after].filter(part => part !== '').join('\n\n');
  return { body, options };
}

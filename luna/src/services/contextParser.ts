export interface ParsedContext {
  type: 'text' | 'json' | 'csv' | 'image' | 'unknown';
  content: string;
  summary: string;
  metadata: Record<string, any>;
}

/** Parse a dropped file into a structured context. */
export async function parseFile(file: File): Promise<ParsedContext> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return parseImageFile(file);
  }

  const text = await file.text();

  if (['json', 'jsonl'].includes(ext)) {
    return parseJsonFile(text, file.name);
  }

  if (['csv', 'tsv'].includes(ext)) {
    return parseCsvFile(text, file.name, ext === 'tsv' ? '\t' : ',');
  }

  if (['txt', 'md', 'log', 'py', 'js', 'ts', 'rs', 'go', 'rb', 'sh', 'yaml', 'yml', 'toml', 'html', 'css'].includes(ext)) {
    return parseTextFile(text, file.name);
  }

  // Unknown type — treat as text
  return parseTextFile(text, file.name);
}

function parseTextFile(content: string, _filename: string): ParsedContext {
  const lines = content.split('\n');
  const preview = content.slice(0, 200);

  return {
    type: 'text',
    content,
    summary: `${lines.length} lines, ${content.length} chars. Preview: ${preview}`,
    metadata: { lineCount: lines.length, charCount: content.length },
  };
}

function parseJsonFile(content: string, filename: string): ParsedContext {
  try {
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return {
        type: 'json',
        content,
        summary: `JSON array with ${parsed.length} items`,
        metadata: { itemCount: parsed.length, isArray: true },
      };
    }

    const keys = Object.keys(parsed);
    return {
      type: 'json',
      content,
      summary: `JSON object with keys: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}`,
      metadata: { keys, keyCount: keys.length },
    };
  } catch {
    return parseTextFile(content, filename);
  }
}

function parseCsvFile(content: string, _filename: string, delimiter: string): ParsedContext {
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    return { type: 'csv', content, summary: 'Empty CSV', metadata: {} };
  }

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rowCount = lines.length - 1;

  return {
    type: 'csv',
    content,
    summary: `${rowCount} rows, columns: ${headers.join(', ')}`,
    metadata: { headers, rowCount, columnCount: headers.length },
  };
}

async function parseImageFile(file: File): Promise<ParsedContext> {
  const sizeKb = Math.round(file.size / 1024);

  return {
    type: 'image',
    content: `[Image: ${file.name}, ${sizeKb}KB]`,
    summary: `Image file (${file.type || 'unknown format'}), ${sizeKb}KB`,
    metadata: { sizeKb, mimeType: file.type },
  };
}

/** Generate a concise summary string for the LLM prompt. */
export function generateContextSummary(parsed: ParsedContext): string {
  return `[${parsed.type.toUpperCase()}] ${parsed.summary}`;
}

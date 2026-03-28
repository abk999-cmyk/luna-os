export interface ParsedContext {
  type: 'text' | 'json' | 'csv' | 'image' | 'unknown';
  content: string;
  summary: string;
  metadata: Record<string, any>;
}

/** Max file size to read as text (10MB). Larger files are summarized without reading. */
const MAX_TEXT_SIZE = 10 * 1024 * 1024;

/** Known text extensions that are safe to read. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'log', 'py', 'js', 'ts', 'rs', 'go', 'rb', 'sh',
  'yaml', 'yml', 'toml', 'html', 'css', 'json', 'jsonl', 'csv', 'tsv',
  'xml', 'sql', 'c', 'cpp', 'h', 'java', 'kt', 'swift', 'r', 'lua',
]);

/** Parse a dropped file into a structured context. */
export async function parseFile(file: File): Promise<ParsedContext> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
    return parseImageFile(file);
  }

  // Guard: reject files that are too large or have unknown binary extensions
  if (file.size > MAX_TEXT_SIZE) {
    return {
      type: 'unknown',
      content: '',
      summary: `File too large to parse as text (${Math.round(file.size / 1024 / 1024)}MB)`,
      metadata: { sizeBytes: file.size, skipped: true },
    };
  }

  if (!TEXT_EXTENSIONS.has(ext)) {
    return {
      type: 'unknown',
      content: '',
      summary: `Unknown file type (.${ext || 'no extension'}), ${Math.round(file.size / 1024)}KB`,
      metadata: { extension: ext, sizeBytes: file.size, skipped: true },
    };
  }

  const text = await file.text();

  if (['json', 'jsonl'].includes(ext)) {
    return parseJsonFile(text, file.name);
  }

  if (['csv', 'tsv'].includes(ext)) {
    return parseCsvFile(text, file.name, ext === 'tsv' ? '\t' : ',');
  }

  // All other known text extensions
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

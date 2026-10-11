/**
 * Minimal, dependency-free XLSX / CSV reader for seed tooling.
 *
 * XLSX is a ZIP of XML parts: we read the central directory, inflate the
 * shared strings and the requested worksheet with node:zlib, and turn the
 * rows into objects keyed by the header row. Supports shared strings,
 * inline strings, numbers and booleans — enough for price lists. No
 * formulas are evaluated (cached values are used).
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function unzip(buffer) {
  // End of central directory record (search backwards for its signature).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP/XLSX file');
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < entries; n += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Bad central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressed);
    files.set(name, () => (method === 0 ? data : inflateRawSync(data)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

function textOf(xml) {
  // Concatenate every <t>…</t> (rich text runs included).
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
}

function columnIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? 'A';
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/** Sheet names in workbook order with their part paths. */
function sheets(files) {
  const workbook = files.get('xl/workbook.xml')?.().toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.().toString('utf8') ?? '';
  const target = new Map(
    [...rels.matchAll(/<Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [
      m[1],
      m[2].replace(/^\/?xl\//, ''),
    ]),
  );
  return [...workbook.matchAll(/<sheet\s[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({
    name: decode(m[1]),
    path: `xl/${target.get(m[2]) ?? ''}`,
  }));
}

/** Rows of one worksheet as arrays of cell values (strings/numbers/booleans). */
export function readXlsxRows(path, sheetName) {
  const files = unzip(readFileSync(path));
  const shared = [];
  const sst = files.get('xl/sharedStrings.xml');
  if (sst) {
    for (const m of sst()
      .toString('utf8')
      .matchAll(/<si>([\s\S]*?)<\/si>/g))
      shared.push(textOf(m[1]));
  }
  const list = sheets(files);
  const sheet = sheetName ? list.find((s) => s.name === sheetName) : list[0];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found (have: ${list.map((s) => s.name).join(', ')})`);
  }
  const xml = files.get(sheet.path)?.().toString('utf8');
  if (!xml) throw new Error(`Sheet part ${sheet.path} missing`);
  const rows = [];
  for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    // Rows are placed by their real number (r="…"): Excel omits empty rows,
    // and headerRow counts sheet rows, not stored ones.
    const rowNo = Number(/\br="(\d+)"/.exec(row[1])?.[1] ?? rows.length + 1);
    while (rows.length < rowNo - 1) rows.push([]);
    const cells = [];
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? 'A1';
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = null;
      if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'b') value = v === '1';
      else if (type === 'str') value = v !== undefined ? decode(v) : '';
      else if (v !== undefined) value = Number(v);
      cells[columnIndex(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** CSV with ; or , separator and "quoted" fields. */
export function readCsvRows(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
}

/**
 * Rows → objects using the header row; `headerRow` (1-based) can skip
 * title rows above the table. Header names are trimmed.
 */
export function tableObjects(rows, headerRow = 1) {
  const header = (rows[headerRow - 1] ?? []).map((h) => String(h ?? '').trim());
  return rows
    .slice(headerRow)
    .map((r) =>
      Object.fromEntries(header.map((h, i) => [h, r[i] ?? null]).filter(([h]) => h !== '')),
    );
}

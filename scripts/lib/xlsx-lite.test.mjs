/**
 * node --test scripts/lib/xlsx-lite.test.mjs
 *
 * Builds a minimal XLSX in memory (stored ZIP + deflated parts) and checks
 * shared strings, XML entities, numbers, empty rows before the header and
 * the CSV reader (";" separator, quotes, decimal comma kept as text).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { readCsvRows, readXlsxRows, tableObjects } from './xlsx-lite.mjs';

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc32(raw), 16);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(head, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

const dir = mkdtempSync(join(tmpdir(), 'xlsx-lite-'));

test('xlsx: header below a title and an empty row, shared strings, entities, numbers', () => {
  const strings = ['CJENOVNIK', 'Šifra', 'Naziv', 'Obračun', 'R-01', 'Roletna &amp; PVC', 'm2'];
  const s = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const path = join(dir, 'pl.xlsx');
  writeFileSync(
    path,
    zip({
      'xl/workbook.xml':
        '<workbook xmlns:r="r"><sheets><sheet name="Ostalo" sheetId="1" r:id="rId1"/><sheet name="Cjenovnik" sheetId="2" r:id="rId2"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/sharedStrings.xml': `<sst>${strings.map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`,
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData/></worksheet>',
      'xl/worksheets/sheet2.xml': `<worksheet><sheetData>
        <row r="1">${s('A1', 0)}</row>
        <row r="3">${s('A3', 1)}${s('B3', 2)}${s('C3', 3)}<c r="D3" t="inlineStr"><is><t>Cijena</t></is></c></row>
        <row r="4">${s('A4', 4)}${s('B4', 5)}${s('C4', 6)}<c r="D4"><v>85.5</v></c></row>
      </sheetData></worksheet>`,
    }),
  );
  const rows = tableObjects(readXlsxRows(path, 'Cjenovnik'), 3);
  assert.deepEqual(rows, [{ Šifra: 'R-01', Naziv: 'Roletna & PVC', Obračun: 'm2', Cijena: 85.5 }]);
  assert.throws(() => readXlsxRows(path, 'Nema'), /not found/);
});

test('csv: semicolon separator, quoted fields, blank lines skipped', () => {
  const path = join(dir, 'pl.csv');
  writeFileSync(path, '﻿Sifra;Naziv;Cijena\r\nR-01;"Roletna; ""PVC""";85,50\r\n\r\n');
  assert.deepEqual(tableObjects(readCsvRows(path)), [
    { Sifra: 'R-01', Naziv: 'Roletna; "PVC"', Cijena: '85,50' },
  ]);
});

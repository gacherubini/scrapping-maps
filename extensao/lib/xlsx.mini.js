/*
 * xlsx.mini.js - gerador de .xlsx sem dependencias externas.
 *
 * Um .xlsx e um arquivo ZIP com XMLs dentro. Aqui o ZIP e montado a mao usando
 * o metodo "stored" (sem compressao), que e valido e o Excel abre normalmente.
 * Isso evita ter que embutir uma biblioteca de deflate.
 *
 * Uso:
 *   const bytes = MiniXLSX.build({
 *     sheetName: 'Lojas',
 *     columns: [{ key: 'nome', label: 'Nome', width: 40, type: 'text' }, ...],
 *     rows: [{ nome: 'Bicho Mania', ... }, ...]
 *   });
 *   MiniXLSX.download('lojas.xlsx', bytes);
 */
(function (global) {
  'use strict';

  const encoder = new TextEncoder();

  // ---------------------------------------------------------------- ZIP ----

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let bit = 0; bit < 8; bit++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  // DOS timestamp fixo em 1980-01-01. O Excel nao liga para a data interna das
  // entradas, e um valor constante torna o arquivo reproduzivel.
  const DOS_TIME = 0;
  const DOS_DATE = 0x21;

  function zip(files) {
    const parts = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);

      const header = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true); // assinatura do local file header
      view.setUint16(4, 20, true); // versao minima
      view.setUint16(6, 0, true); // flags
      view.setUint16(8, 0, true); // metodo 0 = stored
      view.setUint16(10, DOS_TIME, true);
      view.setUint16(12, DOS_DATE, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true); // tamanho comprimido
      view.setUint32(22, data.length, true); // tamanho original
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true); // extra field
      header.set(nameBytes, 30);

      parts.push(header, data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += header.length + data.length;
    }

    const centralStart = offset;
    for (const entry of central) {
      const record = new Uint8Array(46 + entry.nameBytes.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true); // assinatura do central directory
      view.setUint16(4, 20, true); // versao que criou
      view.setUint16(6, 20, true); // versao minima
      view.setUint16(8, 0, true); // flags
      view.setUint16(10, 0, true); // metodo
      view.setUint16(12, DOS_TIME, true);
      view.setUint16(14, DOS_DATE, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint16(30, 0, true); // extra
      view.setUint16(32, 0, true); // comentario
      view.setUint16(34, 0, true); // disco
      view.setUint16(36, 0, true); // atributos internos
      view.setUint32(38, 0, true); // atributos externos
      view.setUint32(42, entry.offset, true);
      record.set(entry.nameBytes, 46);
      parts.push(record);
      offset += record.length;
    }

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true); // numero do disco
    eocdView.setUint16(6, 0, true); // disco do central directory
    eocdView.setUint16(8, central.length, true);
    eocdView.setUint16(10, central.length, true);
    eocdView.setUint32(12, offset - centralStart, true);
    eocdView.setUint32(16, centralStart, true);
    eocdView.setUint16(20, 0, true); // comentario
    parts.push(eocd);

    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
      out.set(part, cursor);
      cursor += part.length;
    }
    return out;
  }

  // ---------------------------------------------------------------- XML ----

  function escapeXml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // caracteres de controle sao invalidos em XML 1.0 e fazem o Excel
      // recusar o arquivo inteiro
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  }

  function columnLetter(index) {
    let letter = '';
    let n = index;
    while (n >= 0) {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    }
    return letter;
  }

  const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const CONTENT_TYPES =
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>';

  const ROOT_RELS =
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const WORKBOOK_RELS =
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';

  // Duas fontes (normal e negrito) e dois estilos: 0 = corpo, 1 = cabecalho.
  const STYLES =
    XML_DECL +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="2">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  function buildWorkbook(sheetName) {
    return (
      XML_DECL +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' +
      escapeXml(sheetName) +
      '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>'
    );
  }

  function buildSheet(columns, rows) {
    const cols = columns
      .map(function (col, i) {
        return (
          '<col min="' +
          (i + 1) +
          '" max="' +
          (i + 1) +
          '" width="' +
          (col.width || 20) +
          '" customWidth="1"/>'
        );
      })
      .join('');

    const header =
      '<row r="1">' +
      columns
        .map(function (col, i) {
          return (
            '<c r="' +
            columnLetter(i) +
            '1" t="inlineStr" s="1"><is><t>' +
            escapeXml(col.label || col.key) +
            '</t></is></c>'
          );
        })
        .join('') +
      '</row>';

    const body = rows
      .map(function (row, r) {
        const rowNumber = r + 2;
        const cells = columns
          .map(function (col, i) {
            const raw = row[col.key];
            if (raw === null || raw === undefined || raw === '') return '';
            const ref = columnLetter(i) + rowNumber;
            if (col.type === 'number') {
              const num = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
              if (!isFinite(num)) return '';
              return '<c r="' + ref + '"><v>' + num + '</v></c>';
            }
            return (
              '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
              escapeXml(raw) +
              '</t></is></c>'
            );
          })
          .join('');
        return '<row r="' + rowNumber + '">' + cells + '</row>';
      })
      .join('');

    return (
      XML_DECL +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>' +
      '<cols>' + cols + '</cols>' +
      '<sheetData>' + header + body + '</sheetData>' +
      '</worksheet>'
    );
  }

  // -------------------------------------------------------------- API ----

  function build(options) {
    const sheetName = options.sheetName || 'Planilha1';
    const files = [
      { name: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
      { name: 'xl/workbook.xml', data: encoder.encode(buildWorkbook(sheetName)) },
      { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
      { name: 'xl/styles.xml', data: encoder.encode(STYLES) },
      {
        name: 'xl/worksheets/sheet1.xml',
        data: encoder.encode(buildSheet(options.columns, options.rows)),
      },
    ];
    return zip(files);
  }

  function download(filename, bytes) {
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
  }

  global.MiniXLSX = { build: build, download: download, zip: zip, crc32: crc32 };
})(typeof globalThis !== 'undefined' ? globalThis : self);

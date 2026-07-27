const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

require('../extensao/lib/xlsx.mini.js');
require('../extensao/lib/schema.js');

const SAIDA = path.join(__dirname, '..', 'tmp', 'amostra.xlsx');

const AMOSTRA = [
  {
    nome: 'Bicho Mania',
    telefone: '(51) 99898-4086',
    endereco: 'R. Joaquim Caetano, 211',
    categoria: 'Banho e tosa',
    nota: 4.5,
    avaliacoes: 8,
    link_maps: 'https://www.google.com/maps/place/Bicho+Mania',
    busca: 'petshop',
    capturado_em: '27/07/2026 18:44:00',
  },
  {
    nome: 'Agropet "Tipo & Bicho" <novo>',
    telefone: '',
    endereco: 'R. Joaquim Nabuco, 171',
    categoria: 'Pet Shop',
    nota: 5,
    avaliacoes: 39,
    link_maps: 'https://www.google.com/maps/place/Agropet?a=1&b=2',
    busca: 'petshop',
    capturado_em: '27/07/2026 18:44:00',
  },
];

test('xlsx: gera arquivo com assinatura de ZIP', () => {
  const bytes = MiniXLSX.build({ sheetName: 'Lojas', columns: COLUMNS, rows: AMOSTRA });
  assert.equal(bytes[0], 0x50); // 'P'
  assert.equal(bytes[1], 0x4b); // 'K'
  assert.ok(bytes.length > 1000, 'arquivo suspeito de tao pequeno');
});

test('xlsx: crc32 confere com valor conhecido', () => {
  // CRC32 de "123456789" e 0xCBF43926, o vetor de teste padrao.
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(MiniXLSX.crc32(bytes), 0xcbf43926);
});

test('xlsx: telefone vem antes dos sem telefone na ordenacao', () => {
  const ordenados = sortRecords([
    { nome: 'Zeta', telefone: '' },
    { nome: 'Alfa', telefone: '(51) 3333-3333' },
    { nome: 'Beta', telefone: '' },
  ]);
  assert.deepEqual(
    ordenados.map((r) => r.nome),
    ['Alfa', 'Beta', 'Zeta']
  );
});

test('nome do arquivo: usa hora local, nao UTC', () => {
  // 27/07/2026 as 18:44 no horario de Brasilia. Em UTC seriam 21:44, e era
  // isso que o nome do arquivo mostrava antes.
  const local = new Date(2026, 6, 27, 18, 44, 0);
  assert.equal(buildFilename(AMOSTRA, local), 'lojas_maps_2026-07-27_18h44_2itens.xlsx');
});

test('nome do arquivo: zero a esquerda em mes, dia e hora', () => {
  const local = new Date(2026, 0, 5, 9, 7, 0);
  assert.equal(buildFilename([], local), 'lojas_maps_2026-01-05_09h07_0itens.xlsx');
});

test('nome do arquivo: nao contem caractere proibido no Windows', () => {
  const nome = buildFilename(AMOSTRA);
  assert.ok(!/[<>:"/\\|?*]/.test(nome), 'nome invalido no Windows: ' + nome);
});

test('xlsx: escreve amostra em disco para inspecao externa', () => {
  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  const bytes = MiniXLSX.build({ sheetName: 'Lojas', columns: COLUMNS, rows: AMOSTRA });
  fs.writeFileSync(SAIDA, bytes);
  assert.ok(fs.statSync(SAIDA).size > 1000);
});

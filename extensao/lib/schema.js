/*
 * Definicao unica das colunas do Excel, compartilhada entre o content script
 * (botao "Exportar" no overlay) e o popup. Mudou aqui, mudou nos dois.
 */
(function (global) {
  'use strict';

  global.COLUMNS = [
    { key: 'nome', label: 'Nome', width: 38, type: 'text' },
    { key: 'telefone', label: 'Telefone', width: 18, type: 'text' },
    { key: 'endereco', label: 'Endereco', width: 42, type: 'text' },
    { key: 'categoria', label: 'Categoria', width: 22, type: 'text' },
    { key: 'nota', label: 'Nota', width: 8, type: 'number' },
    { key: 'avaliacoes', label: 'Avaliacoes', width: 12, type: 'number' },
    { key: 'latitude', label: 'Latitude', width: 14, type: 'number' },
    { key: 'longitude', label: 'Longitude', width: 14, type: 'number' },
    { key: 'patrocinado', label: 'Anuncio', width: 10, type: 'text' },
    { key: 'link_maps', label: 'Link Maps', width: 45, type: 'text' },
    { key: 'busca', label: 'Busca', width: 24, type: 'text' },
    { key: 'capturado_em', label: 'Capturado em', width: 20, type: 'text' },
  ];

  global.buildFilename = function (records) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h');
    return 'lojas_maps_' + stamp + '_' + records.length + 'itens.xlsx';
  };

  // Telefone e o campo mais importante: os registros com telefone vem primeiro,
  // depois ordem alfabetica por nome.
  global.sortRecords = function (records) {
    return records.slice().sort(function (a, b) {
      const aTem = a.telefone ? 0 : 1;
      const bTem = b.telefone ? 0 : 1;
      if (aTem !== bTem) return aTem - bTem;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);

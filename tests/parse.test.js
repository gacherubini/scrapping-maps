const test = require('node:test');
const assert = require('node:assert');
const parse = require('../extensao/lib/parse.js');

// Textos reais capturados da lista de resultados do Google Maps (busca
// "petshop" em Canoas/RS), quebrados em linhas como o innerText entrega.
const CARDS = {
  agropet: [
    'Agropet Tipo Bicho',
    '5,0',
    '(39)',
    'Pet Shop · R. Joaquim Nabuco, 171',
    'Fechado',
    'Abre ter. às 08:30',
    '(51) 99858-1025',
    'Compras na loja · Retirada na loja · Entrega',
  ],
  bichoMania: [
    'Bicho Mania',
    '4,5',
    '(8)',
    'Banho e tosa · R. Joaquim Caetano, 211',
    'Fechado',
    'Abre ter. às 08:30',
    '(51) 99898-4086',
  ],
  veterinaria: [
    'Clínica Veterinária Dra. Daoiá Tainê',
    '4,8',
    '(839)',
    'Pet Shop · ♿ · R. Rui Barbosa, 351',
    'Aberto 24 horas',
    '(51) 3466-0454',
    'Serviços no local',
  ],
  agroshop: [
    'Agroshop 4 Patas',
    '4,9',
    '(15)',
    'Agricultura e pecuária · ♿ · R. Cristóvão Colombo, 52 - loja 02',
    'Fecha em breve',
    '18:45',
    'Abre ter. às 09:00',
    '(51) 99463-8076',
    'Serviços no local',
  ],
  semTelefone: [
    'Mundo dos Pets',
    '4,7',
    '(38)',
    'Pet Shop · R. Farroupilha, 900',
    'Aberto',
    'Fecha às 19:00',
    'Compras na loja · Entrega',
  ],
};

// Cards capturados ao vivo da pagina real em 27/07/2026. O HTML entregue pelo
// Maps difere do que a lista aparenta: o telefone vem grudado na linha de
// horario, e os anuncios usam outro formato de endereco.
const CARDS_REAIS = {
  cesalPatrocinado: [
    'CESAL - Clínica Veterinária 24 horas',
    'Patrocinado',
    'CESAL - Clínica Veterinária 24 horas',
    '4,4(520)',
    'Veterinário · 4903 Avenida Sertório',
    'Aberto 24 horas · (51) 3013-5696',
  ],
  cobasi: [
    'Cobasi Canoas BR-116',
    'Patrocinado',
    'Cobasi Canoas BR-116',
    '4,6(684)',
    'Loja de suprimentos para animais de estimação · 6211 Avenida Getúlio Vargas',
    'Aberto · Fecha 21:45 · (11) 93350-5743',
    'Compras na loja',
    '·',
    'Retirada na loja',
    '·',
    'Entrega sem contato',
  ],
  petz: [
    'Petz Canoas',
    'Petz Canoas',
    '4,5(2.018)',
    'Pet Shop ·  · Av. Getúlio Vargas, 6401',
    'Aberto · Fecha 22:00 · (51) 3052-0478',
    '"Variedade de produtos entre rações e utensilios para pets."',
  ],
  caoTelli: [
    'CãoTelli | Pet Shop',
    'CãoTelli | Pet Shop',
    '5,0(1.824)',
    'Pet Shop · Av. Santos Ferreira, 997',
    'Fecha em breve · 19:00 · Abre ter. às 09:00 · (51) 99765-5755',
    '"Super recomendo, muitas opções para seus pets."',
  ],
};

function texto(linhas) {
  return linhas.join('\n');
}

test('telefone: extrai celular e fixo dos cards reais', () => {
  assert.equal(parse.parseTelefone(texto(CARDS.agropet)), '(51) 99858-1025');
  assert.equal(parse.parseTelefone(texto(CARDS.bichoMania)), '(51) 99898-4086');
  assert.equal(parse.parseTelefone(texto(CARDS.veterinaria)), '(51) 3466-0454');
  assert.equal(parse.parseTelefone(texto(CARDS.agroshop)), '(51) 99463-8076');
});

test('telefone: card sem telefone devolve vazio, nunca lixo', () => {
  assert.equal(parse.parseTelefone(texto(CARDS.semTelefone)), '');
});

test('telefone: nao confunde horario, nota nem numero de rua', () => {
  assert.equal(parse.parseTelefone('Abre ter. às 08:30'), '');
  assert.equal(parse.parseTelefone('4,5 (8)'), '');
  assert.equal(parse.parseTelefone('R. Cristóvão Colombo, 52 - loja 02'), '');
  assert.equal(parse.parseTelefone('Fecha em breve · 18:45'), '');
  assert.equal(parse.parseTelefone('(839)'), '');
});

test('telefone: normaliza formato solto sem parenteses', () => {
  assert.equal(parse.parseTelefone('Contato 51 99778-1230'), '(51) 99778-1230');
});

test('endereco: separa categoria do logradouro', () => {
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS.agropet), {
    categoria: 'Pet Shop',
    endereco: 'R. Joaquim Nabuco, 171',
  });
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS.bichoMania), {
    categoria: 'Banho e tosa',
    endereco: 'R. Joaquim Caetano, 211',
  });
});

test('endereco: ignora o icone de acessibilidade no meio da linha', () => {
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS.veterinaria), {
    categoria: 'Pet Shop',
    endereco: 'R. Rui Barbosa, 351',
  });
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS.agroshop), {
    categoria: 'Agricultura e pecuária',
    endereco: 'R. Cristóvão Colombo, 52 - loja 02',
  });
});

test('endereco: icone renderizado como string vazia tambem funciona', () => {
  assert.deepEqual(
    parse.parseCategoriaEndereco(['Pet Shop ·  · R. Rui Barbosa, 351']),
    { categoria: 'Pet Shop', endereco: 'R. Rui Barbosa, 351' }
  );
});

test('endereco: nao confunde a linha de servicos com endereco', () => {
  assert.deepEqual(
    parse.parseCategoriaEndereco(['Compras na loja · Retirada na loja · Entrega']),
    { categoria: '', endereco: '' }
  );
  assert.deepEqual(parse.parseCategoriaEndereco(['Serviços no local']), {
    categoria: '',
    endereco: '',
  });
});

test('avaliacao: le nota e contagem do aria-label em pt-BR', () => {
  assert.deepEqual(parse.parseAvaliacao('4,5 estrelas 8 avaliações'), {
    nota: 4.5,
    avaliacoes: 8,
  });
  assert.deepEqual(parse.parseAvaliacao('5,0 estrelas 39 avaliações'), {
    nota: 5,
    avaliacoes: 39,
  });
  assert.deepEqual(parse.parseAvaliacao('4,8 estrelas 839 avaliações'), {
    nota: 4.8,
    avaliacoes: 839,
  });
});

test('avaliacao: milhar com ponto vira numero inteiro', () => {
  assert.deepEqual(parse.parseAvaliacao('4,6 estrelas 1.234 avaliações'), {
    nota: 4.6,
    avaliacoes: 1234,
  });
});

test('avaliacao: aceita interface em ingles', () => {
  assert.deepEqual(parse.parseAvaliacao('4.8 stars 839 reviews'), {
    nota: 4.8,
    avaliacoes: 839,
  });
});

test('avaliacao: lugar sem nota devolve vazio', () => {
  assert.deepEqual(parse.parseAvaliacao(''), { nota: '', avaliacoes: '' });
  assert.deepEqual(parse.parseAvaliacao(null), { nota: '', avaliacoes: '' });
});

test('url: extrai o ftid como id', () => {
  const href =
    'https://www.google.com/maps/place/Bicho+Mania/data=!4m7!3m6!1s0x951977a1b2c3d4e5:0x1a2b3c4d5e6f7a8b!8m2!3d-29.9123456!4d-51.1876543!16s%2Fg%2F11abc123';
  assert.equal(parse.parseLugarId(href), '0x951977a1b2c3d4e5:0x1a2b3c4d5e6f7a8b');
});

test('url: sem ftid cai no place id /g/', () => {
  const href = 'https://www.google.com/maps/place/Loja/data=!4m2!3m1!16s%2Fg%2F11xyz789';
  assert.equal(parse.parseLugarId(href), 'g/11xyz789');
});

test('url: href inutil nao quebra', () => {
  assert.equal(parse.parseLugarId(''), '');
  assert.equal(parse.parseLugarId(null), '');
});

test('url: o mesmo lugar em duas buscas gera o mesmo id', () => {
  // A dedup depende disso: o Maps varia o resto da URL entre as buscas, mas o
  // ftid e estavel.
  const a =
    'https://www.google.com/maps/place/Petz+Canoas/data=!4m7!3m6!1s0x951971e40c905c69:0x1017f35fb56b3846!8m2!3d-29.9!4d-51.1';
  const b =
    'https://www.google.com/maps/place/Petz/data=!3m1!4b1!4m6!3m5!1s0x951971E40C905C69:0x1017F35FB56B3846!8m2!3d-29.91!4d-51.18';
  assert.equal(parse.parseLugarId(a), parse.parseLugarId(b));
});

test('busca: le a query da URL e prefere ela ao input', () => {
  const url = 'https://www.google.com/maps/search/petshop/@-29.91,-51.18,15z';
  assert.equal(parse.parseBusca(url, 'outra coisa'), 'petshop');
});

test('busca: decodifica acentos e o + de espaco', () => {
  const url = 'https://www.google.com/maps/search/petshop+em+canoas/@-29.91,-51.18,15z';
  assert.equal(parse.parseBusca(url, ''), 'petshop em canoas');
  const acentuada = 'https://www.google.com/maps/search/veterin%C3%A1rio/@-29.91,-51.18,15z';
  assert.equal(parse.parseBusca(acentuada, ''), 'veterinário');
});

test('busca: fora de /search cai no valor do campo de texto', () => {
  const url = 'https://www.google.com/maps/place/Bicho+Mania/@-29.91,-51.18,17z';
  assert.equal(parse.parseBusca(url, 'petshop'), 'petshop');
});

// --------------------------------------------------------------------------
// Regressao contra o HTML real. Estes casos vieram da pagina ao vivo e
// pegaram um bug que os exemplos montados a mao nao pegavam.
// --------------------------------------------------------------------------

test('real: telefone grudado na linha de horario e extraido', () => {
  assert.equal(parse.parseTelefone(texto(CARDS_REAIS.cesalPatrocinado)), '(51) 3013-5696');
  assert.equal(parse.parseTelefone(texto(CARDS_REAIS.petz)), '(51) 3052-0478');
  assert.equal(parse.parseTelefone(texto(CARDS_REAIS.caoTelli)), '(51) 99765-5755');
  assert.equal(parse.parseTelefone(texto(CARDS_REAIS.cobasi)), '(11) 93350-5743');
});

test('real: telefone na linha de horario NAO vaza para a coluna endereco', () => {
  // O bug: "Aberto 24 horas · (51) 3013-5696" tem digito no ultimo pedaco,
  // entao a heuristica ingenua gravava o telefone como endereco.
  assert.deepEqual(parse.parseCategoriaEndereco(['Aberto 24 horas · (51) 3013-5696']), {
    categoria: '',
    endereco: '',
  });
  assert.deepEqual(parse.parseCategoriaEndereco(['Aberto · Fecha 22:00 · (51) 3052-0478']), {
    categoria: '',
    endereco: '',
  });
  assert.deepEqual(
    parse.parseCategoriaEndereco(['Fecha em breve · 19:00 · Abre ter. às 09:00 · (51) 99765-5755']),
    { categoria: '', endereco: '' }
  );
});

test('real: endereco correto mesmo com a linha de horario logo abaixo', () => {
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS_REAIS.petz), {
    categoria: 'Pet Shop',
    endereco: 'Av. Getúlio Vargas, 6401',
  });
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS_REAIS.caoTelli), {
    categoria: 'Pet Shop',
    endereco: 'Av. Santos Ferreira, 997',
  });
});

test('real: anuncio usa endereco com numero na frente', () => {
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS_REAIS.cesalPatrocinado), {
    categoria: 'Veterinário',
    endereco: '4903 Avenida Sertório',
  });
  assert.deepEqual(parse.parseCategoriaEndereco(CARDS_REAIS.cobasi), {
    categoria: 'Loja de suprimentos para animais de estimação',
    endereco: '6211 Avenida Getúlio Vargas',
  });
});

test('real: linha de servicos quebrada em varias linhas nao vira endereco', () => {
  assert.deepEqual(parse.parseCategoriaEndereco(['·']), { categoria: '', endereco: '' });
  assert.deepEqual(parse.parseCategoriaEndereco(['Entrega sem contato']), {
    categoria: '',
    endereco: '',
  });
});

test('real: marca resultados patrocinados', () => {
  assert.equal(parse.parsePatrocinado(CARDS_REAIS.cesalPatrocinado), true);
  assert.equal(parse.parsePatrocinado(CARDS_REAIS.cobasi), true);
  assert.equal(parse.parsePatrocinado(CARDS_REAIS.petz), false);
  assert.equal(parse.parsePatrocinado(CARDS_REAIS.caoTelli), false);
});

test('real: aria-label diz "comentarios", nao "avaliacoes"', () => {
  assert.deepEqual(parse.parseAvaliacao('4,4 estrelas 520 comentários'), {
    nota: 4.4,
    avaliacoes: 520,
  });
  assert.deepEqual(parse.parseAvaliacao('4,5 estrelas 2.018 comentários'), {
    nota: 4.5,
    avaliacoes: 2018,
  });
});

test('real: href de anuncio sem place id ainda rende ftid', () => {
  const href =
    'https://www.google.com/maps/place/CESAL/data=!4m7!3m6!1s0x9519770e4dc5cb75:0xabfb23d1340ec581!8m2!3d-29.998465!4d-51.15';
  assert.equal(parse.parseLugarId(href), '0x9519770e4dc5cb75:0xabfb23d1340ec581');
});

/*
 * Funcoes puras de parsing. Nao tocam no DOM de proposito: recebem strings e
 * devolvem valores, o que as torna testaveis fora do navegador (ver tests/).
 * Toda a fragilidade do scraper mora aqui.
 */
(function (global) {
  'use strict';

  // Formato brasileiro com DDD entre parenteses. Estrita de proposito: e melhor
  // deixar a celula vazia do que confundir "08:30" (horario), "4,5 (8)" (nota)
  // ou "R. Joaquim Nabuco, 171" (numero da rua) com telefone.
  const TELEFONE_ESTRITO = /\((\d{2})\)\s?(\d{4,5})[-\s.](\d{4})/;
  // Fallback para quando o DDD vem sem parenteses.
  const TELEFONE_SOLTO = /(?:^|[^\d])(\d{2})\s(\d{4,5})-(\d{4})(?!\d)/;

  function parseTelefone(texto) {
    if (!texto) return '';
    const match = texto.match(TELEFONE_ESTRITO) || texto.match(TELEFONE_SOLTO);
    if (!match) return '';
    return '(' + match[1] + ') ' + match[2] + '-' + match[3];
  }

  const PREFIXO_LOGRADOURO =
    /^(r\.|rua|av\.|avenida|al\.|alameda|trav\.|travessa|tv\.|rod\.|rodovia|estr\.|estrada|praca|praça|largo|beco|via|br-|rs-|sc-|sp-)/i;

  // "Aberto 24 horas", "Fecha em breve", "Abre ter. as 09:00": tem digito, mas
  // e horario de funcionamento, nao endereco.
  const STATUS_FUNCIONAMENTO =
    /^(aberto|abre|fechado|fecha|encerrad|temporariamente|permanentemente|open|clos|24\s*horas)/i;
  const SO_HORARIO = /^\d{1,2}[:h]\d{2}$/;

  /*
   * Um pedaco de linha so vira endereco se parecer logradouro E nao for uma das
   * coisas que o Maps costuma colocar do lado do endereco separado por ponto.
   * A ordem importa: telefone e horario tem digito, entao precisam ser
   * descartados antes do teste de "tem digito".
   */
  function pareceEndereco(parte) {
    if (!parte) return false;
    if (parseTelefone(parte)) return false;
    if (SO_HORARIO.test(parte)) return false;
    if (STATUS_FUNCIONAMENTO.test(parte)) return false;
    return /\d/.test(parte) || PREFIXO_LOGRADOURO.test(parte);
  }

  /*
   * O card mistura varias linhas separadas por ponto:
   *   "Pet Shop . R. Joaquim Nabuco, 171"        <- queremos esta
   *   "Aberto 24 horas . (51) 3013-5696"         <- horario + telefone
   *   "Compras na loja . Retirada . Entrega"     <- servicos
   * Percorremos as linhas na ordem (a de endereco vem antes da de horario) e,
   * dentro da linha, de tras para frente, porque o endereco fica no fim.
   */
  function parseCategoriaEndereco(linhas) {
    const vazio = { categoria: '', endereco: '' };
    if (!linhas || !linhas.length) return vazio;

    for (const linha of linhas) {
      if (linha.indexOf('·') === -1) continue;
      const partes = linha
        .split('·')
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
      if (partes.length < 2) continue;

      for (let i = partes.length - 1; i >= 1; i--) {
        if (!pareceEndereco(partes[i])) continue;
        return { categoria: partes[0], endereco: partes[i] };
      }
    }
    return vazio;
  }

  // Resultados de anuncio trazem esse marcador numa linha propria.
  const MARCADOR_ANUNCIO = /^(patrocinado|sponsored|an[úu]ncio)$/i;

  function parsePatrocinado(linhas) {
    if (!linhas) return false;
    return linhas.some(function (linha) {
      return MARCADOR_ANUNCIO.test(linha.trim());
    });
  }

  /*
   * O aria-label das estrelas vem como "4,5 estrelas 8 avaliacoes" em pt-BR e
   * "4.5 stars 8 reviews" em ingles. Aceita os dois.
   */
  function parseAvaliacao(ariaLabel) {
    const vazio = { nota: '', avaliacoes: '' };
    if (!ariaLabel) return vazio;

    const nota = ariaLabel.match(/([\d]+[.,][\d]+|\d+)\s*(?:estrela|star)/i);
    const avaliacoes = ariaLabel.match(/([\d., \s]+)\s*(?:avalia|review|coment)/i);

    return {
      nota: nota ? Number(nota[1].replace(',', '.')) : '',
      avaliacoes: avaliacoes ? Number(avaliacoes[1].replace(/[^\d]/g, '')) : '',
    };
  }

  /*
   * A URL do lugar carrega tudo que precisamos de identidade e coordenada:
   *   /maps/place/Nome/data=!4m7!3m6!1s0x9519...:0xabc...!8m2!3d-29.9!4d-51.1
   * O par hex (o "ftid") e a chave de deduplicacao mais estavel disponivel.
   */
  function parseLugarUrl(href) {
    const resultado = { id: '', latitude: '', longitude: '' };
    if (!href) return resultado;

    const coords = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (coords) {
      resultado.latitude = Number(coords[1]);
      resultado.longitude = Number(coords[2]);
    }

    const ftid = href.match(/(0x[0-9a-f]+:0x[0-9a-f]+)/i);
    if (ftid) {
      resultado.id = ftid[1].toLowerCase();
      return resultado;
    }

    // Alguns resultados so trazem o place id no formato /g/11xxxx.
    const placeId = href.match(/!1?6s(%2F|\/)g(%2F|\/)([0-9a-z_]+)/i);
    if (placeId) {
      resultado.id = 'g/' + placeId[3].toLowerCase();
    }
    return resultado;
  }

  /*
   * Preferimos a query da URL (/maps/search/petshop/@...) porque ela reflete a
   * busca que de fato gerou a lista; o campo de texto pode ja ter sido editado.
   */
  function parseBusca(url, valorDoInput) {
    if (url) {
      const match = url.match(/\/maps\/search\/([^/@?]+)/);
      if (match) {
        try {
          return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
        } catch (erro) {
          return match[1].replace(/\+/g, ' ').trim();
        }
      }
    }
    return (valorDoInput || '').trim();
  }

  global.MapsParse = {
    parseTelefone: parseTelefone,
    parseCategoriaEndereco: parseCategoriaEndereco,
    parsePatrocinado: parsePatrocinado,
    parseAvaliacao: parseAvaliacao,
    parseLugarUrl: parseLugarUrl,
    parseBusca: parseBusca,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.MapsParse;
  }
})(typeof globalThis !== 'undefined' ? globalThis : self);

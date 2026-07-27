/*
 * Service worker: dono unico do armazenamento. Os content scripts so mandam
 * registros; quem decide o que ja existe e o que entra e este arquivo.
 *
 * O armazenamento e um mapa id -> registro em chrome.storage.local, o que
 * torna a deduplicacao trivial e sobrevive a fechar o Chrome.
 */

const CHAVE = 'lojas';
const CHAVE_CAPTURA = 'capturando';

// O service worker pode receber varias mensagens ao mesmo tempo. Sem serializar
// as escritas, dois ADICIONAR concorrentes leriam o mesmo estado e o segundo
// sobrescreveria o primeiro. A fila garante uma operacao por vez.
let fila = Promise.resolve();

function enfileirar(operacao) {
  const proxima = fila.then(operacao, operacao);
  // Um erro numa operacao nao pode envenenar a fila das seguintes.
  fila = proxima.catch(function () {});
  return proxima;
}

async function carregar() {
  const dados = await chrome.storage.local.get(CHAVE);
  return dados[CHAVE] || {};
}

// A captura comeca desligada: nada e coletado ate o usuario pedir. O estado
// mora no storage, e nao na aba, para sobreviver aos recarregamentos que o
// proprio Maps provoca ao trocar de busca, e para valer em todas as abas.
async function capturando() {
  const dados = await chrome.storage.local.get(CHAVE_CAPTURA);
  return dados[CHAVE_CAPTURA] === true;
}

async function resumir(mapa) {
  const registros = Object.values(mapa);
  let comTelefone = 0;
  for (const registro of registros) {
    if (registro.telefone) comTelefone++;
  }
  return {
    total: registros.length,
    comTelefone: comTelefone,
    capturando: await capturando(),
  };
}

async function adicionar(novos) {
  const mapa = await carregar();
  // Segunda barreira: mesmo que um content script desatualizado mande dados,
  // nada entra com a captura desligada.
  if (!(await capturando())) return resumir(mapa);

  let adicionados = 0;
  for (const registro of novos) {
    if (!registro || !registro.id) continue;
    const existente = mapa[registro.id];
    if (!existente) {
      mapa[registro.id] = registro;
      adicionados++;
      continue;
    }
    // Ja conheciamos o lugar. Se a releitura trouxe um telefone que faltava,
    // aproveitamos - telefone e o campo que mais importa.
    if (!existente.telefone && registro.telefone) {
      existente.telefone = registro.telefone;
      adicionados++;
    }
  }
  if (adicionados) await chrome.storage.local.set({ [CHAVE]: mapa });
  return resumir(mapa);
}

chrome.runtime.onMessage.addListener(function (mensagem, remetente, responder) {
  enfileirar(async function () {
    switch (mensagem.tipo) {
      case 'ADICIONAR':
        responder(await adicionar(mensagem.registros || []));
        break;
      case 'ESTADO':
        responder(await resumir(await carregar()));
        break;
      case 'CAPTURA':
        await chrome.storage.local.set({ [CHAVE_CAPTURA]: mensagem.ligado === true });
        responder(await resumir(await carregar()));
        break;
      case 'TUDO': {
        const mapa = await carregar();
        responder({ registros: Object.values(mapa) });
        break;
      }
      case 'LIMPAR':
        await chrome.storage.local.set({ [CHAVE]: {} });
        responder(await resumir({}));
        break;
      default:
        responder(null);
    }
  }).catch(function (erro) {
    console.error('[Maps Coletor]', erro);
    responder(null);
  });

  return true; // mantem o canal aberto para a resposta assincrona
});

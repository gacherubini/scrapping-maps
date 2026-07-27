/*
 * Service worker: dono unico do armazenamento. Os content scripts so mandam
 * registros; quem decide o que ja existe e o que entra e este arquivo.
 *
 * O armazenamento e um mapa id -> registro em chrome.storage.local, o que
 * torna a deduplicacao trivial e sobrevive a fechar o Chrome.
 */

const CHAVE = 'lojas';

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

function resumir(mapa) {
  const registros = Object.values(mapa);
  let comTelefone = 0;
  for (const registro of registros) {
    if (registro.telefone) comTelefone++;
  }
  return { total: registros.length, comTelefone: comTelefone };
}

async function adicionar(novos) {
  const mapa = await carregar();
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
        responder(resumir(await carregar()));
        break;
      case 'TUDO': {
        const mapa = await carregar();
        responder({ registros: Object.values(mapa) });
        break;
      }
      case 'LIMPAR':
        await chrome.storage.local.set({ [CHAVE]: {} });
        responder({ total: 0, comTelefone: 0 });
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

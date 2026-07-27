/*
 * Content script: le a lista de resultados do Google Maps enquanto o usuario
 * rola, e manda os registros novos para o background guardar.
 *
 * Principio dos seletores: NUNCA depender de nome de classe. O Google ofusca e
 * troca as classes sem aviso. So usamos ancoras semanticas (role, aria-label,
 * padrao do href), que o Google nao pode mudar sem quebrar a acessibilidade do
 * proprio produto.
 */
(function () {
  'use strict';

  const INTERVALO_VARREDURA_MS = 700;
  const SELETOR_LISTA = 'div[role="feed"]';
  const SELETOR_LUGAR = 'a[href*="/maps/place/"]';
  const SELETOR_ESTRELAS = 'span[role="img"][aria-label]';
  const LIMITE_CARDS_SEM_NOME = 0.3;

  const jaEnviados = new Set();
  let estado = { total: 0, comTelefone: 0 };
  let alerta = '';

  // --------------------------------------------------------- extracao ----

  /*
   * Cada resultado e um filho direto do feed. Partimos do link do lugar e
   * subimos ate esse filho direto, que e o card completo (com telefone,
   * endereco e nota).
   */
  function coletarCards() {
    const lista = document.querySelector(SELETOR_LISTA);
    if (!lista) return null;

    const cards = [];
    const vistos = new Set();
    for (const link of lista.querySelectorAll(SELETOR_LUGAR)) {
      let card = link;
      while (card && card.parentElement !== lista) card = card.parentElement;
      if (!card || vistos.has(card)) continue;
      vistos.add(card);
      cards.push({ card: card, link: link });
    }
    return cards;
  }

  function extrair(card, link, busca) {
    const href = link.href || '';
    const daUrl = MapsParse.parseLugarUrl(href);
    const nome = (link.getAttribute('aria-label') || '').trim();

    const texto = card.innerText || '';
    const linhas = texto
      .split('\n')
      .map(function (linha) {
        return linha.trim();
      })
      .filter(Boolean);

    const local = MapsParse.parseCategoriaEndereco(linhas);

    const estrelas = card.querySelector(SELETOR_ESTRELAS);
    const nota = MapsParse.parseAvaliacao(estrelas ? estrelas.getAttribute('aria-label') : '');

    // Sem id estavel na URL, caimos em nome+endereco. Pior que o ftid, mas
    // ainda evita duplicar o mesmo card relido durante o scroll.
    const id = daUrl.id || 'txt:' + nome + '|' + local.endereco;

    return {
      id: id,
      nome: nome,
      telefone: MapsParse.parseTelefone(texto),
      endereco: local.endereco,
      categoria: local.categoria,
      nota: nota.nota,
      avaliacoes: nota.avaliacoes,
      latitude: daUrl.latitude,
      longitude: daUrl.longitude,
      patrocinado: MapsParse.parsePatrocinado(linhas) ? 'sim' : '',
      link_maps: href.split('?')[0],
      busca: busca,
      capturado_em: new Date().toLocaleString('pt-BR'),
    };
  }

  function varrer() {
    const cards = coletarCards();

    if (cards === null) {
      // Sem lista na tela nao e erro: o usuario pode estar num lugar especifico
      // ou so olhando o mapa.
      alerta = '';
      render();
      return;
    }

    if (cards.length === 0) {
      alerta = 'Lista encontrada mas nenhum resultado lido. Os seletores podem ter quebrado.';
      render();
      return;
    }

    const campoBusca = document.querySelector('input#searchboxinput');
    const busca = MapsParse.parseBusca(location.href, campoBusca ? campoBusca.value : '');

    const novos = [];
    let semNome = 0;
    for (const item of cards) {
      const registro = extrair(item.card, item.link, busca);
      if (!registro.nome) semNome++;
      if (!registro.nome) continue;
      if (jaEnviados.has(registro.id)) continue;
      jaEnviados.add(registro.id);
      novos.push(registro);
    }

    alerta =
      semNome / cards.length > LIMITE_CARDS_SEM_NOME
        ? 'Muitos cards sem nome (' + semNome + ' de ' + cards.length + '). O HTML do Maps mudou.'
        : '';

    if (novos.length) {
      enviar(novos);
    } else {
      render();
    }
  }

  // ------------------------------------------------------ comunicacao ----

  function enviar(registros) {
    chrome.runtime.sendMessage({ tipo: 'ADICIONAR', registros: registros }, function (resposta) {
      if (chrome.runtime.lastError || !resposta) {
        // O service worker pode ter hibernado no meio do envio. Liberamos os
        // ids para que a proxima varredura tente de novo.
        for (const registro of registros) jaEnviados.delete(registro.id);
        return;
      }
      estado = resposta;
      render();
    });
  }

  function pedirEstado() {
    chrome.runtime.sendMessage({ tipo: 'ESTADO' }, function (resposta) {
      if (chrome.runtime.lastError || !resposta) return;
      estado = resposta;
      render();
    });
  }

  function exportar(botao) {
    chrome.runtime.sendMessage({ tipo: 'TUDO' }, function (resposta) {
      if (chrome.runtime.lastError || !resposta || !resposta.registros.length) {
        botao.textContent = 'Nada para exportar';
        setTimeout(function () {
          botao.textContent = 'Exportar Excel';
        }, 2000);
        return;
      }
      const registros = sortRecords(resposta.registros);
      const bytes = MiniXLSX.build({
        sheetName: 'Lojas',
        columns: COLUMNS,
        rows: registros,
      });
      MiniXLSX.download(buildFilename(registros), bytes);
    });
  }

  // ----------------------------------------------------------- overlay ----

  let raiz = null;
  let elContador = null;
  let elDetalhe = null;
  let elAlerta = null;

  function montarOverlay() {
    raiz = document.createElement('div');
    raiz.id = 'maps-coletor-overlay';

    const contador = document.createElement('div');
    contador.id = 'maps-coletor-contador';

    elContador = document.createElement('strong');
    elDetalhe = document.createElement('span');
    contador.appendChild(elContador);
    contador.appendChild(elDetalhe);

    elAlerta = document.createElement('div');
    elAlerta.id = 'maps-coletor-alerta';
    elAlerta.hidden = true;

    const botoes = document.createElement('div');
    botoes.id = 'maps-coletor-botoes';

    const exportarBtn = document.createElement('button');
    exportarBtn.textContent = 'Exportar Excel';
    exportarBtn.className = 'maps-coletor-primario';
    exportarBtn.addEventListener('click', function () {
      exportar(exportarBtn);
    });

    const limparBtn = document.createElement('button');
    limparBtn.textContent = 'Limpar';
    let confirmando = false;
    limparBtn.addEventListener('click', function () {
      if (!confirmando) {
        confirmando = true;
        limparBtn.textContent = 'Confirmar?';
        limparBtn.classList.add('maps-coletor-perigo');
        setTimeout(function () {
          confirmando = false;
          limparBtn.textContent = 'Limpar';
          limparBtn.classList.remove('maps-coletor-perigo');
        }, 4000);
        return;
      }
      chrome.runtime.sendMessage({ tipo: 'LIMPAR' }, function (resposta) {
        if (chrome.runtime.lastError) return;
        jaEnviados.clear();
        estado = resposta || { total: 0, comTelefone: 0 };
        confirmando = false;
        limparBtn.textContent = 'Limpar';
        limparBtn.classList.remove('maps-coletor-perigo');
        render();
      });
    });

    botoes.appendChild(exportarBtn);
    botoes.appendChild(limparBtn);

    raiz.appendChild(contador);
    raiz.appendChild(elAlerta);
    raiz.appendChild(botoes);
    document.body.appendChild(raiz);
  }

  function render() {
    if (!raiz) return;
    elContador.textContent = estado.total + (estado.total === 1 ? ' loja' : ' lojas');
    elDetalhe.textContent = ' · ' + estado.comTelefone + ' com telefone';
    elAlerta.hidden = !alerta;
    elAlerta.textContent = alerta;
  }

  // -------------------------------------------------------------- inicio ----

  function iniciar() {
    montarOverlay();
    pedirEstado();
    varrer();
    setInterval(varrer, INTERVALO_VARREDURA_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  } else {
    iniciar();
  }
})();

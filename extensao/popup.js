/*
 * Popup: mostra o acumulado (inclusive quando nao ha aba do Maps aberta) e
 * exporta o Excel. Toda leitura vem do background, nunca do content script.
 */
(function () {
  'use strict';

  const elTotal = document.getElementById('total');
  const elSituacao = document.getElementById('situacao');
  const elBuscas = document.getElementById('buscas');
  const btnCaptura = document.getElementById('captura');
  const btnExportar = document.getElementById('exportar');
  const btnLimpar = document.getElementById('limpar');

  let registros = [];
  let capturando = false;

  function perguntar(mensagem) {
    return new Promise(function (resolver) {
      chrome.runtime.sendMessage(mensagem, function (resposta) {
        resolver(chrome.runtime.lastError ? null : resposta);
      });
    });
  }

  function agruparPorBusca(lista) {
    const grupos = new Map();
    for (const registro of lista) {
      const chave = registro.busca || '(sem busca)';
      grupos.set(chave, (grupos.get(chave) || 0) + 1);
    }
    return Array.from(grupos.entries()).sort(function (a, b) {
      return b[1] - a[1];
    });
  }

  function render() {
    const comTelefone = registros.filter(function (registro) {
      return registro.telefone;
    }).length;

    elTotal.textContent = registros.length;

    const acumulado =
      registros.length === 0
        ? 'nenhuma loja ainda'
        : comTelefone + ' com telefone · ' + (registros.length - comTelefone) + ' sem';
    elSituacao.textContent = (capturando ? 'capturando' : 'pausado') + ' · ' + acumulado;

    document.body.classList.toggle('ligado', capturando);
    btnCaptura.textContent = capturando ? 'Pausar captura' : 'Começar a captar';

    elBuscas.textContent = '';
    for (const [busca, quantidade] of agruparPorBusca(registros)) {
      const item = document.createElement('li');
      const nome = document.createElement('span');
      nome.textContent = busca;
      nome.title = busca;
      const contagem = document.createElement('span');
      contagem.textContent = quantidade;
      item.appendChild(nome);
      item.appendChild(contagem);
      elBuscas.appendChild(item);
    }
  }

  async function carregar() {
    const [tudo, estado] = await Promise.all([
      perguntar({ tipo: 'TUDO' }),
      perguntar({ tipo: 'ESTADO' }),
    ]);
    registros = tudo ? tudo.registros : [];
    capturando = estado ? estado.capturando === true : false;
    render();
  }

  btnCaptura.addEventListener('click', async function () {
    btnCaptura.disabled = true;
    const estado = await perguntar({ tipo: 'CAPTURA', ligado: !capturando });
    btnCaptura.disabled = false;
    if (!estado) return;
    capturando = estado.capturando === true;
    render();
  });

  btnExportar.addEventListener('click', function () {
    if (!registros.length) {
      btnExportar.textContent = 'Nada para exportar';
      setTimeout(function () {
        btnExportar.textContent = 'Exportar Excel';
      }, 2000);
      return;
    }
    const ordenados = sortRecords(registros);
    const bytes = MiniXLSX.build({
      sheetName: 'Lojas',
      columns: COLUMNS,
      rows: ordenados,
    });
    MiniXLSX.download(buildFilename(ordenados), bytes);
  });

  let confirmando = false;
  btnLimpar.addEventListener('click', async function () {
    if (!confirmando) {
      confirmando = true;
      btnLimpar.textContent = 'Confirmar?';
      btnLimpar.classList.add('perigo');
      setTimeout(function () {
        confirmando = false;
        btnLimpar.textContent = 'Limpar';
        btnLimpar.classList.remove('perigo');
      }, 4000);
      return;
    }
    await perguntar({ tipo: 'LIMPAR' });
    confirmando = false;
    btnLimpar.textContent = 'Limpar';
    btnLimpar.classList.remove('perigo');
    registros = [];
    render();
  });

  carregar();
})();

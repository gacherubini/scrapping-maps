const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/*
 * Roda o background.js de verdade dentro de um chrome.* falso, para exercitar
 * o protocolo de mensagens sem precisar instalar a extensao.
 */
function carregarBackground() {
  let deposito = {};
  let ouvinte = null;

  const chrome = {
    storage: {
      local: {
        async get(chave) {
          const chaves = Array.isArray(chave) ? chave : [chave];
          const saida = {};
          for (const k of chaves) {
            if (k in deposito) saida[k] = deposito[k];
          }
          return saida;
        },
        async set(objeto) {
          Object.assign(deposito, objeto);
        },
      },
    },
    runtime: {
      onMessage: {
        addListener(fn) {
          ouvinte = fn;
        },
      },
    },
  };

  const codigo = fs.readFileSync(
    path.join(__dirname, '..', 'extensao', 'background.js'),
    'utf8'
  );
  vm.runInNewContext(codigo, { chrome, console, Object, Promise });

  // Envia uma mensagem como o Chrome faria e espera a resposta assincrona.
  function enviar(mensagem) {
    return new Promise((resolver, rejeitar) => {
      const prazo = setTimeout(
        () => rejeitar(new Error('o background nunca respondeu a ' + mensagem.tipo)),
        1000
      );
      const manteveCanalAberto = ouvinte(mensagem, {}, (resposta) => {
        clearTimeout(prazo);
        resolver(resposta);
      });
      assert.equal(manteveCanalAberto, true, 'listener precisa retornar true');
    });
  }

  return { enviar, espiarDeposito: () => deposito };
}

const LOJA = {
  id: '0xaaa:0xbbb',
  nome: 'Bicho Mania',
  telefone: '(51) 99898-4086',
};

test('captura comeca desligada', async () => {
  const { enviar } = carregarBackground();
  const estado = await enviar({ tipo: 'ESTADO' });
  assert.equal(estado.capturando, false);
  assert.equal(estado.total, 0);
});

test('CAPTURA ligado devolve o estado ja ligado', async () => {
  const { enviar } = carregarBackground();
  const estado = await enviar({ tipo: 'CAPTURA', ligado: true });
  assert.equal(estado.capturando, true, 'o botao depende deste campo para trocar de texto');
});

test('CAPTURA persiste no storage', async () => {
  const { enviar, espiarDeposito } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  assert.equal(espiarDeposito().capturando, true);
  await enviar({ tipo: 'CAPTURA', ligado: false });
  assert.equal(espiarDeposito().capturando, false);
});

test('desligado, ADICIONAR nao grava nada', async () => {
  const { enviar } = carregarBackground();
  const estado = await enviar({ tipo: 'ADICIONAR', registros: [LOJA] });
  assert.equal(estado.total, 0);
});

test('ligado, ADICIONAR grava e conta telefone', async () => {
  const { enviar } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  const estado = await enviar({ tipo: 'ADICIONAR', registros: [LOJA] });
  assert.equal(estado.total, 1);
  assert.equal(estado.comTelefone, 1);
  assert.equal(estado.capturando, true);
});

test('mesma loja duas vezes nao duplica', async () => {
  const { enviar } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  await enviar({ tipo: 'ADICIONAR', registros: [LOJA] });
  const estado = await enviar({ tipo: 'ADICIONAR', registros: [LOJA] });
  assert.equal(estado.total, 1);
});

test('telefone que faltava e preenchido na releitura', async () => {
  const { enviar } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  await enviar({ tipo: 'ADICIONAR', registros: [{ id: 'x', nome: 'Loja', telefone: '' }] });
  const estado = await enviar({
    tipo: 'ADICIONAR',
    registros: [{ id: 'x', nome: 'Loja', telefone: '(51) 3333-3333' }],
  });
  assert.equal(estado.total, 1);
  assert.equal(estado.comTelefone, 1);
});

test('LIMPAR zera as lojas mas nao desliga a captura', async () => {
  const { enviar } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  await enviar({ tipo: 'ADICIONAR', registros: [LOJA] });
  const estado = await enviar({ tipo: 'LIMPAR' });
  assert.equal(estado.total, 0);
  assert.equal(estado.capturando, true, 'limpar nao deveria pausar a coleta');
});

test('mensagens concorrentes nao se sobrescrevem', async () => {
  const { enviar } = carregarBackground();
  await enviar({ tipo: 'CAPTURA', ligado: true });
  await Promise.all([
    enviar({ tipo: 'ADICIONAR', registros: [{ id: 'a', telefone: '(51) 1111-1111' }] }),
    enviar({ tipo: 'ADICIONAR', registros: [{ id: 'b', telefone: '(51) 2222-2222' }] }),
    enviar({ tipo: 'ADICIONAR', registros: [{ id: 'c', telefone: '' }] }),
  ]);
  const estado = await enviar({ tipo: 'ESTADO' });
  assert.equal(estado.total, 3);
});

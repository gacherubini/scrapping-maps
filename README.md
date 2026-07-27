# Maps Coletor

Extensão do Chrome que coleta as lojas do Google Maps enquanto você rola a
lista de resultados e exporta tudo para Excel. O foco é **telefone**.

Não automatiza nada no navegador: ela só lê o que já está na tela, no seu
Chrome, na sua sessão. Quem rola a lista é você.

## Instalar

1. Abra `chrome://extensions`
2. Ligue o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Escolha a pasta `extensao/`

## Usar

1. Abra o Google Maps e pesquise (`petshop`, `veterinário`, o que for)
2. Role a lista da esquerda. O painel no canto inferior direito vai contando:
   `40 lojas · 39 com telefone`
3. Pode trocar de busca, mudar de cidade, fechar o Chrome e voltar depois —
   o acumulado persiste e não duplica
4. Clique em **Exportar Excel** (no painel ou no ícone da extensão)

## Colunas do Excel

| Coluna | Observação |
|---|---|
| Nome | |
| Telefone | formato normalizado `(51) 99999-9999` |
| Endereco | logradouro como o Maps exibe no card |
| Categoria | "Pet Shop", "Veterinário", ... |
| Nota / Avaliacoes | número, dá pra ordenar e filtrar |
| Latitude / Longitude | extraídas da URL do lugar |
| Anuncio | `sim` quando o resultado é patrocinado |
| Link Maps | link direto do lugar |
| Busca | o termo que gerou aquele resultado |
| Capturado em | |

As lojas **com telefone vêm primeiro** na planilha, depois em ordem alfabética.

## Cobertura esperada

Medido numa busca real por "petshop" em Canoas/RS: **40 lojas, 39 com telefone
(97,5%)**. Cards sem telefone ficam com a célula vazia — nunca com um valor
inventado.

## Como funciona

```
content.js   lê o feed de resultados a cada 700ms  ──┐
                                                     │ registros novos
lib/parse.js funções puras de parsing (testadas)     │
                                                     ▼
                                            background.js
                                     dono do chrome.storage.local
                                       mapa id -> registro (dedup)
                                                     │
                                    ┌────────────────┴────────────────┐
                                    ▼                                 ▼
                              overlay na página                    popup
                                    └──────────► lib/xlsx.mini.js ◄──┘
                                                 gera o .xlsx
```

**Deduplicação** pelo `ftid` (`0x...:0x...`) que vem na URL do lugar. É o
identificador mais estável disponível sem usar a API paga. Se um lugar já
conhecido reaparecer trazendo um telefone que faltava, o telefone é
preenchido.

**Seletores** nunca usam nome de classe — o Google ofusca e troca as classes
sem aviso. Só `role="feed"`, `aria-label` e o padrão do `href`, que o Google
não pode mudar sem quebrar a acessibilidade do próprio produto.

**Excel** é gerado por `lib/xlsx.mini.js`, um escritor de `.xlsx` sem
dependências (um `.xlsx` é um ZIP de XMLs; o ZIP é montado à mão com método
"stored"). Evita CDN, evita a política de segurança do Maps e evita os
problemas de acento e separador do CSV.

## Testes

```
npm test
```

30 testes cobrindo o parsing, incluindo casos de regressão com texto **real**
capturado da página ao vivo. Vale rodar antes de mexer em `lib/parse.js`.

Rodar os testes também gera `tmp/amostra.xlsx`, uma planilha de exemplo que
serve para conferir o formato de saída (validada com `openpyxl`: números como
número, acentos, cabeçalho congelado).

## Quando quebrar

O Maps muda de HTML de tempos em tempos. A extensão avisa em vez de coletar
lixo em silêncio — o painel fica vermelho com uma destas mensagens:

- *"Lista encontrada mas nenhum resultado lido"* → o seletor do card mudou
- *"Muitos cards sem nome"* → o `aria-label` do link mudou

Nos dois casos o conserto é em `lib/parse.js` / `content.js`, e o jeito de
achar o novo formato é abrir o DevTools na lista e inspecionar um card.

## Limitações conhecidas

- Só captura o que aparece no card. Loja que não publica telefone no Maps sai
  com a célula vazia — a extensão não abre a ficha de cada loja.
- Endereço é o texto curto do card (rua e número), não o endereço completo
  com bairro e CEP.
- Regex de telefone é brasileira (`(DD) 99999-9999`). Fora do Brasil não pega.

# Painel Comercial — Clínica Rejuvenesce

`index.html` (~478 KB) concentra HTML, CSS e JavaScript, sem build e sem dependências.
Ao lado dele mora só o `manifest.webmanifest`, com os ícones embutidos como data URI:
ele torna o painel instalável, e é assim que o minipc da TV ganha som sem gesto do
usuário. Publicado em GitHub Pages.

URL: https://rejuvenesce5513.github.io/painel-rejuvenesce/

## Antes de mexer

1. O arquivo é único e grande. Faça edições cirúrgicas, não reescreva blocos inteiros.
2. Depois de **qualquer** alteração, rode as três verificações da seção "Verificações
   obrigatórias". Duas vezes já publiquei arquivo quebrado por pular isso.
3. Nunca use `localStorage` para dados de negócio. Ele guarda só configuração e tema.

## Arquitetura

Autenticação OAuth2 PKCE contra o Microsoft Graph, direto do navegador. Nenhum dado
trafega por servidor próprio.

```
Navegador → Microsoft Graph → SharePoint (4 arquivos Excel)
```

| Arquivo | Abas usadas |
|---|---|
| `VENDAS E CAMPANHA.xlsx` | Vendas, Marcações, Prevendas, Metas |
| `Metas.xlsx` | Metas, Fechamentos |
| `Cirurgias.xlsx` | Cirurgias |
| `Parametros Comissões.xlsx` | Parâmetros Comissões |

O último fica em pasta com permissão restrita — é a trava de acesso à aba Comissões.
Quem não tem permissão recebe 403 do próprio M365.

### Leitura

`readSheet()` abre uma sessão de workbook (`createSession`), divide o intervalo em
blocos de ~60 mil células e busca 4 em paralelo. Sem a sessão, cada leitura reabre o
arquivo de 4 MB. Foram ~40 requisições sequenciais antes, 13 em paralelo agora.

### Abas do painel

`com` Comercial · `pre` Pré-vendas · `cir` Cirurgias · `cms` Comissões · `mts` Metas

Quem vê o quê vem de `acessos` no bloco NATIVO.

## Bloco NATIVO

No topo do JavaScript, entre os marcadores `/* NATIVO-INICIO */` e `/* NATIVO-FIM */`.
São 69 chaves. É a configuração que viaja com o arquivo e vale para todos.

Precedência: `DEF` < `NATIVO` < `SALVO` (localStorage do usuário).

**Exceção:** caminhos de arquivo (`arqMetas`, `arqRegras`, `shMetasCfg`, `shRegras`,
`file`, `tenant`, `client`) sempre vêm do NATIVO, mesmo que o usuário tenha outro valor
salvo. Sem isso, um valor velho no navegador esconde o caminho publicado.

`versao` controla a limpeza do localStorage. Ao subir a versão, o SALVO é apagado
**menos** as chaves de conexão e os dados do usuário (`metas`, `superPct`). Já apaguei
metas por esquecer disso — não repita.

Botão **Baixar index.html atualizado** reescreve esse bloco com a configuração atual.

## Regras de negócio

### Meta

Vem do `Metas.xlsx`, por mês, separada em transplante (TC) e terapia (TEC).

A meta do período é **proporcional aos dias úteis** do recorte dentro de cada mês:

```
meta = Σ (meta do mês × dias úteis do recorte no mês ÷ dias úteis do mês)
```

Mês inteiro dá a meta cheia. "Hoje" dá um dia útil. Atravessando meses, soma as partes.
Vale igual para a meta individual de cada vendedor.

Feriados são configuráveis e afetam dias úteis, meta, ocupação e médias em tudo.

### Meta individual (política de 2026)

```
meta individual = meta do mês ÷ soma dos pesos do time × peso individual
```

Pesos: Avaliador Sênior 1,40 · Avaliador 1,20 · Nível 3 1,10 · Nível 2 1,00 · Nível 1 0,80.

Validado contra o exemplo de maio/2026 do documento oficial, valor por valor.
Depois de calculado, os campos continuam editáveis — casos excepcionais se ajustam à mão.

### Comissão

Faixas progressivas sobre o faturamento próprio, a partir de mai/2026:
0,1% até 400k · 0,2% de 400k a 700k · 0,3% acima de 700k. Cada percentual incide só
sobre a parcela da faixa.

Etapas elegíveis: `FECHAMENTO`, `FINALIZADO`. **Antes de 01/09/2026 inclui
`REVISÃO DE PENDÊNCIAS`** — a venda existe, falta acerto documental. Configurável em
`etapasAntesVigencia` e `vigenciaEtapas`.

Validações que devem bater ao centavo: março R$ 13.959,30 · abril R$ 8.437,85 ·
agosto R$ 3.262,73 (com Revisão de Pendências).

### Prêmio

Quatro critérios cumulativos:

1. Entrada financeira mínima — R$ 600.000 até ago/2026, R$ 750.000 depois
2. Meta de transplante do mês
3. Meta de terapia, com mínimo de R$ 60.000
4. Supermeta, para o prêmio adicional

A entrada vem da aba `Fechamentos` do `Metas.xlsx`, que o financeiro alimenta. Formato
da coluna Mês: `jan/26`. Quando a aba não tem o mês, aceita valor digitado à mão.

Cumpridos os critérios: 0,1% do faturado da clínica **para cada elegível**. Supermeta
soma R$ 3.500 por vendedor e R$ 7.000 por liderança.

### Cirurgias

Meta de 11 por dia útil. Ocupação = realizadas ÷ (11 × dias úteis **decorridos**).
Nunca dividir por dias que não aconteceram — foi erro corrigido.

Status `Aguardando` conta como concluída: o paciente já está na sala.

## Identidade de pessoas

O mesmo vendedor aparece com grafias diferentes no RD, no Feegow e nas planilhas.
Três camadas resolvem:

1. **`apelidos`** — mapa `grafia normalizada → nome oficial`, editado em
   Configurar › Pessoas. `canon()` aplica na entrada dos dados.
2. **`mesmaPessoa(a,b)`** — casamento por palavras, ignorando acento, caixa e
   conectivos. Conservador: `Ricardo Melo` e `Ricardo Santos` não casam.
3. **`chaveUnica(mapa,nome)`** — na agregação, procura chave existente que case.

O nome oficial prevalece sobre a grafia mais longa encontrada nos dados.

`pessoas`, `liderancas`, `acessos`, `admins`, `emailsComissao`, `equipePre` e `apelidos`
são todos editados na mesma tabela de Configurar › Pessoas e derivados dela ao salvar.

## Verificações obrigatórias

Depois de qualquer alteração no `index.html`:

```bash
# 1. sintaxe do JavaScript
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');
  const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  fs.writeFileSync('/tmp/a.js',m[m.length-1][1]);" && node --check /tmp/a.js

# 2. todo getElementById tem elemento correspondente no HTML
# 3. o script roda do início ao fim num DOM simulado
```

As verificações 2 e 3 pegam a classe de erro mais comum aqui: JavaScript criado sem o
HTML correspondente, ou HTML removido com o JavaScript apontando para ele.

## Armadilhas conhecidas

**Datas com hora.** A aba Prevendas guarda data e hora em colunas separadas. Comparar
o valor combinado com o fim do período — que é meia-noite — exclui tudo do último dia.
Filtre sempre pela data truncada.

**Escrita parcial.** Ao atualizar um intervalo, o Graph grava o intervalo inteiro. Mande
apenas as colunas que mudaram, mesclando com o que já está lá. Ver `mesclar()` no sync.

**Texto onde deveria haver número.** Partes das planilhas têm datas como texto. O log
do sync marca com `[texto]`.

**`localStorage` não é fonte de verdade.** Se o dado precisa ser visto por outra pessoa,
tem que ir para o SharePoint ou para o bloco NATIVO publicado.

**`pause()` que chega depois do `play()`.** `play()` devolve promessa; o som só começa
quando ela resolve. Um `pause()` escrito logo abaixo — ou dentro do `.then()` de outro
`play()` — chega depois e mata a trilha sem erro nenhum. Já silenciou a comemoração
duas vezes, por caminhos diferentes. A bandeira `SOM_QUERENDO` marca que há som
intencional tocando; quem for pausar precisa olhar para ela antes.

## Pendências

- Aba Prevendas com 24 mil linhas é 66% das células lidas; o painel usa o mês corrente.
  Arquivar 2025 ou ler só os últimos N registros.
- Colunas fantasma em `Vendas` (até R) e `Marcações` (até S) estendem o `usedRange`.
- Prêmio de meta coletiva não distingue quem já recebeu — não há histórico de pagamento.

## Fluxo de trabalho obrigatório

1. **`git pull` antes de qualquer alteração.** Sem exceção.
2. **Depois de mexer no `index.html`, rodar `node testar.js`.** Baseline: `APROVADO`
   com 1 aviso (108 ids sem uso). Se reprovar, corrigir e rodar de novo antes de
   seguir adiante.
3. **Nunca commitar nem dar push sem autorização explícita minha na conversa.**
4. **Preview local:** `npx.cmd serve -l 8080` a partir da pasta do repositório, e
   abrir `http://localhost:8080/` com a barra final. Nunca subir servidor a partir da
   raiz do perfil do usuário.
5. **Uma alteração por vez.**

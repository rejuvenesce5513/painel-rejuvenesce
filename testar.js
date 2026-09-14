#!/usr/bin/env node
/**
 * Verificação do index.html do Painel Comercial.
 *
 *   node testar.js              verifica ./index.html
 *   node testar.js outro.html   verifica outro arquivo
 *
 * Sai com código 1 se algo falhar, para travar CI ou hook de commit.
 *
 * Três checagens, na ordem em que os erros costumam aparecer:
 *   1. sintaxe do JavaScript
 *   2. todo getElementById tem um id correspondente no HTML
 *   3. o script roda do início ao fim num DOM simulado
 *
 * A segunda e a terceira existem porque o erro mais comum aqui é JavaScript
 * criado sem o HTML correspondente, ou HTML removido com o JavaScript ainda
 * apontando para ele. Nenhuma das duas aparece na checagem de sintaxe.
 */

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const arquivo = process.argv[2] || "index.html";
const falhas = [];
const avisos = [];

function titulo(t) { console.log("\n" + t); }
function ok(t) { console.log("  OK    " + t); }
function erro(t) { console.log("  FALHA " + t); falhas.push(t); }
function aviso(t) { console.log("  ~     " + t); avisos.push(t); }

if (!fs.existsSync(arquivo)) {
  console.log("Arquivo não encontrado: " + arquivo);
  process.exit(1);
}

const html = fs.readFileSync(arquivo, "utf8");
console.log(path.basename(arquivo) + " — " + Math.round(html.length / 1024) + " KB");

/* ---------------------------------------------------------------- 1. sintaxe */
titulo("1. Sintaxe do JavaScript");

const blocos = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!blocos.length) {
  erro("nenhum bloco <script> encontrado");
  resumo();
}
const codigo = blocos[blocos.length - 1][1];

try {
  new vm.Script(codigo, { filename: "index.html <script>" });
  ok("o bloco principal compila (" + Math.round(codigo.length / 1024) + " KB)");
} catch (e) {
  erro("erro de sintaxe: " + e.message);
  resumo();
}

/* --------------------------------------------------- 2. ids buscados x existentes */
titulo("2. Elementos buscados pelo código");

const idsNoHtml = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
const idsBuscados = new Set([
  ...codigo.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g),
  ...codigo.matchAll(/getElementById\("([A-Za-z0-9_-]+)"\)/g)
].map(m => m[1]));

const ausentes = [...idsBuscados].filter(id => !idsNoHtml.has(id));
if (ausentes.length) {
  erro("o código procura " + ausentes.length + " id(s) que não existem no HTML:");
  ausentes.forEach(id => console.log("          " + id));
} else {
  ok([...idsBuscados].length + " id(s) buscados, todos presentes no HTML");
}

const orfaos = [...idsNoHtml].filter(id => !idsBuscados.has(id) && !/^(view|tab)/.test(id));
if (orfaos.length > 25) aviso(orfaos.length + " id(s) no HTML sem uso no código (normal em rótulos)");

/* --------------------------------------------------------- 3. execução completa */
titulo("3. Execução num DOM simulado");

function elemento(id) {
  const el = {
    id, value: "", textContent: "", _html: "", style: {}, dataset: {},
    checked: false, disabled: false, type: "text", className: "", tagName: "DIV",
    children: [], parentElement: { style: {} }, previousElementSibling: { textContent: "" },
    classList: { _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); },
      contains(c) { return this._s.has(c); } },
    appendChild(x) { el.children.push(x); },
    insertBefore(x) { el.children.unshift(x); },
    setAttribute() {}, removeAttribute() {}, remove() {}, focus() {}, click() {},
    contains() { return false; },
    addEventListener() {}, removeEventListener() {},
    animate() { return { onfinish: null, cancel() {} }; },
    querySelector() { return elemento("qs"); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return el._html; }, set(v) { el._html = v; }
  });
  el.insertAdjacentHTML = (_, b) => { el._html += b; };
  return el;
}

const criados = {};
const buscasNulas = [];

const sandbox = {
  console: { log() {}, warn() {}, error() {}, info() {} },
  document: {
    getElementById(id) {
      if (!idsNoHtml.has(id)) { buscasNulas.push(id); return null; }
      return criados[id] || (criados[id] = elemento(id));
    },
    createElement: () => elemento("novo"),
    createTextNode: () => ({}),
    documentElement: { setAttribute() {}, classList: { add() {}, remove() {} } },
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
    head: { appendChild() {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    cookie: ""
  },
  window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
  localStorage: { _d: {},
    getItem(k) { return k in this._d ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; } },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  location: { origin: "https://exemplo", pathname: "/p/", search: "", hash: "", href: "https://exemplo/p/", replace() {} },
  history: { replaceState() {}, pushState() {} },
  navigator: { userAgent: "node", clipboard: { writeText: async () => {} } },
  crypto: require("crypto").webcrypto,
  btoa: s => Buffer.from(s, "binary").toString("base64"),
  atob: s => Buffer.from(s, "base64").toString("binary"),
  fetch: async () => ({ ok: false, status: 0, json: async () => ({}), text: async () => "" }),
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame: () => 0,
  alert() {}, confirm: () => false, prompt: () => null,
  URL: { createObjectURL: () => "blob:", revokeObjectURL() {} },
  Blob: function () {}, FileReader: function () {},
  AudioContext: function () {
    return { state: "running", currentTime: 0, destination: {}, sampleRate: 44100,
      resume: async () => {}, createOscillator: () => oscilador(), createGain: () => ganho(),
      createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
      createBufferSource: () => ({ buffer: null, connect: () => ganho(), start() {}, stop() {} }),
      createBiquadFilter: () => ({ type: "", frequency: { value: 0 }, Q: { value: 0 }, connect: () => ganho() }) };
  }
};
function ganho() { const g = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 }, connect: () => g }; return g; }
function oscilador() { const o = { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: () => ganho(), start() {}, stop() {} }; return o; }
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = sandbox.localStorage;
sandbox.window.AudioContext = sandbox.AudioContext;

try {
  vm.createContext(sandbox);
  new vm.Script(codigo, { filename: "index.html" }).runInContext(sandbox, { timeout: 15000 });
  ok("o script roda do início ao fim sem lançar exceção");
} catch (e) {
  erro("exceção durante a execução: " + e.message);
  if (e.stack) console.log("          " + e.stack.split("\n").slice(1, 3).join("\n          "));
}

if (buscasNulas.length) {
  const u = [...new Set(buscasNulas)];
  erro("durante a execução, " + u.length + " id(s) vieram nulos: " + u.join(", "));
}

/* ------------------------------------------------------- 4. bloco de configuração */
titulo("4. Bloco de configuração");

const i = html.indexOf("/* NATIVO-INICIO */");
const f = html.indexOf("/* NATIVO-FIM */");
if (i < 0 || f < 0 || f < i) {
  erro("marcadores NATIVO-INICIO / NATIVO-FIM não encontrados ou fora de ordem");
} else {
  const trecho = html.slice(i, f);
  try {
    const cfg = JSON.parse(trecho.slice(trecho.indexOf("{"), trecho.lastIndexOf("}") + 1));
    ok("JSON válido, versão " + cfg.versao + ", " + Object.keys(cfg).length + " chaves");
    for (const k of ["tenant", "client", "file", "acessos"])
      if (!cfg[k] || (Array.isArray(cfg[k]) && !cfg[k].length))
        aviso("configuração sem " + k);
  } catch (e) {
    erro("o bloco NATIVO não é um JSON válido: " + e.message);
  }
}

/* ------------------------------------------------------------------- resumo */
resumo();

function resumo() {
  console.log("");
  if (falhas.length) {
    console.log("REPROVADO — " + falhas.length + " falha(s)");
    console.log("Não publique este arquivo.");
    process.exit(1);
  }
  console.log("APROVADO" + (avisos.length ? " com " + avisos.length + " aviso(s)" : ""));
  process.exit(0);
}

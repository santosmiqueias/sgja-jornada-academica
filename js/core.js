/*
 * Regras de negócio puras (sem tela e sem banco).
 * Funciona no navegador (window.SGJACore) e no Node (require) para os testes.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SGJACore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const soDigitos = (v) => String(v == null ? "" : v).replace(/\D+/g, "");

  /* ---------- Validações ---------- */

  // Algoritmo oficial dos dois dígitos verificadores do CPF (módulo 11).
  function validarCPF(valor) {
    const cpf = soDigitos(valor);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digito = (base) => {
      let soma = 0;
      for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    const d1 = digito(cpf.slice(0, 9));
    const d2 = digito(cpf.slice(0, 10));
    return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
  }

  function validarEmail(valor) {
    const email = String(valor || "").trim();
    return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
  }

  // Celular brasileiro: DDD válido + 9 dígitos começando em 9, ou fixo com 8 dígitos.
  function validarTelefone(valor) {
    const tel = soDigitos(valor);
    if (tel.length !== 10 && tel.length !== 11) return false;
    const ddd = Number(tel.slice(0, 2));
    if (ddd < 11 || ddd > 99) return false;
    if (tel.length === 11 && tel[2] !== "9") return false;
    return true;
  }

  // Nome e sobrenome, só letras (com acento), espaços, apóstrofo e hífen.
  function validarNome(valor) {
    const nome = normalizarNome(valor);
    if (nome.length < 5 || nome.length > 100) return false;
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(nome)) return false;
    return nome.split(" ").filter((p) => p.length >= 2).length >= 2;
  }

  function validarMatricula(valor) {
    const m = soDigitos(valor);
    return m.length >= 6 && m.length <= 12;
  }

  /* ---------- Máscaras ---------- */

  function aplicarMascara(valor, padrao) {
    const d = soDigitos(valor);
    let out = "", i = 0;
    for (const ch of padrao) {
      if (i >= d.length) break;
      if (ch === "9") out += d[i++];
      else out += ch;
    }
    return out;
  }
  const mascaraCPF = (v) => aplicarMascara(v, "999.999.999-99");
  // Aceita número colado com +55 na frente.
  const semDDI = (v) => { const d = soDigitos(v); return d.length > 11 && d.startsWith("55") ? d.slice(2) : d; };
  const mascaraTelefone = (v) =>
    semDDI(v).length > 10 ? aplicarMascara(semDDI(v), "(99) 99999-9999") : aplicarMascara(semDDI(v), "(99) 9999-9999");
  const mascaraMatricula = (v) => soDigitos(v).slice(0, 12);

  /* ---------- Normalização e LGPD ---------- */

  function normalizarNome(valor) {
    return String(valor || "").replace(/\s+/g, " ").trim();
  }

  // "maria DA silva" -> "Maria da Silva"
  function capitalizarNome(valor) {
    const minusculas = ["da", "de", "do", "das", "dos", "e"];
    return normalizarNome(valor)
      .toLowerCase()
      .split(" ")
      .map((p, i) => (i > 0 && minusculas.includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
      .join(" ");
  }

  const normalizarEmail = (v) => String(v || "").trim().toLowerCase();

  // Exibe só o miolo do CPF: ***.456.789-**
  function mascararCPFParaExibicao(valor) {
    const c = soDigitos(valor);
    if (c.length !== 11) return "***.***.***-**";
    return `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
  }

  /* ---------- Frequência e aprovação ---------- */

  // Soma a carga das atividades em que o aluno tem check-in (cada atividade conta uma vez).
  function calcularHoras(frequencias, eventos, alunoId) {
    const cargaPorEvento = new Map(eventos.map((e) => [e.id, Number(e.cargaHoraria) || 0]));
    const vistos = new Set();
    let horas = 0;
    for (const f of frequencias) {
      if (f.alunoId !== alunoId || vistos.has(f.eventoId)) continue;
      if (!cargaPorEvento.has(f.eventoId)) continue;
      vistos.add(f.eventoId);
      horas += cargaPorEvento.get(f.eventoId);
    }
    return { horas, atividades: [...vistos] };
  }

  // Regra do certificado: check-in em pelo menos X% das atividades ofertadas (arredonda para cima).
  // 6 atividades × 50% = 3.
  function atividadesMinimas(totalAtividades, percentual) {
    return Math.max(1, Math.ceil((Number(totalAtividades) * Number(percentual)) / 100));
  }

  // feitas = em quantas atividades o aluno fez check-in; horas vai impressa no certificado.
  function situacaoAluno(feitas, totalAtividades, percentual, horas) {
    const minimo = atividadesMinimas(totalAtividades, percentual);
    return { aprovado: feitas >= minimo, feitas, total: totalAtividades, minimo, faltam: Math.max(0, minimo - feitas), horas: horas || 0 };
  }

  /* ---------- Assinaturas (QR Code e código do certificado) ---------- */

  async function sha256Hex(texto) {
    const c = (typeof crypto !== "undefined" && crypto.subtle) ? crypto : require("crypto").webcrypto;
    const buf = await c.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Conteúdo do QR Code do ingresso: SGJA|<alunoId>|<assinatura>
  async function gerarTokenIngresso(alunoId, cpf, segredo) {
    const assinatura = (await sha256Hex(`${alunoId}|${soDigitos(cpf)}|${segredo}`)).slice(0, 16);
    return `SGJA|${alunoId}|${assinatura}`;
  }

  function lerTokenIngresso(texto) {
    const partes = String(texto || "").trim().split("|");
    if (partes.length !== 3 || partes[0] !== "SGJA" || !partes[1] || !/^[a-f0-9]{16}$/.test(partes[2])) return null;
    return { alunoId: partes[1], assinatura: partes[2] };
  }

  // Código de autenticidade do certificado: XXXX-XXXX-XXXX
  async function gerarCodigoCertificado(alunoId, cpf, horas, segredo) {
    const h = (await sha256Hex(`CERT|${alunoId}|${soDigitos(cpf)}|${horas}|${segredo}`)).slice(0, 12).toUpperCase();
    return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
  }

  /* ---------- Senhas da comissão organizadora ---------- */

  // Mínimo de 8 caracteres, com pelo menos uma letra e um número.
  function validarSenha(valor) {
    const s = String(valor || "");
    return s.length >= 8 && s.length <= 72 && /[A-Za-z]/.test(s) && /\d/.test(s);
  }

  function gerarSalt() {
    const c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : require("crypto").webcrypto;
    return [...c.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // PBKDF2-SHA256 com 100 mil repetições: a senha nunca é guardada, só este resultado.
  async function hashSenha(senha, saltHex) {
    const c = (typeof crypto !== "undefined" && crypto.subtle) ? crypto : require("crypto").webcrypto;
    const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
    const chave = await c.subtle.importKey("raw", new TextEncoder().encode(String(senha)), "PBKDF2", false, ["deriveBits"]);
    const bits = await c.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, chave, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function escaparHTML(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function gerarId(prefixo) {
    const rnd = (typeof crypto !== "undefined" && crypto.getRandomValues)
      ? [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("")
      : Math.random().toString(16).slice(2, 14);
    return `${prefixo}${Date.now().toString(36)}${rnd}`.toUpperCase();
  }

  /* ---------- Lembretes por WhatsApp ---------- */

  // Data/hora de início da atividade. "horario" vem como "08:00 – 12:00"; fuso de Teresina = -03:00.
  function inicioEvento(ev, fuso) {
    const hora = String(ev.horario || "").split(/[–-]/)[0].trim();
    if (!/^\d{2}:\d{2}$/.test(hora)) return null;
    const d = new Date(`${ev.data}T${hora}:00${fuso || "-03:00"}`);
    return isNaN(d) ? null : d;
  }

  // Atividades cujo lembrete deve sair agora: entre (início - antecedência) e o início.
  // A janela até o início cobre o caso de o servidor ter ficado fora do ar no minuto exato.
  function eventosParaLembrete(eventos, agora, antecedenciaMin, fuso) {
    const t = new Date(agora).getTime();
    return eventos.filter((ev) => {
      const ini = inicioEvento(ev, fuso);
      if (!ini) return false;
      return t >= ini.getTime() - antecedenciaMin * 60000 && t < ini.getTime();
    });
  }

  // Formato internacional exigido pelo WhatsApp: 55 + DDD + número (só dígitos).
  function telefoneE164(valor) {
    const d = soDigitos(valor);
    if (d.length === 13 && d.startsWith("55")) return d;
    return validarTelefone(d) ? `55${d}` : null;
  }

  // Só recebe quem autorizou WhatsApp E se inscreveu naquela atividade.
  function recebeLembrete(aluno, eventoId) {
    return !!aluno && aluno.aceitaWhatsApp === true && Array.isArray(aluno.atividades) && aluno.atividades.includes(eventoId);
  }

  // Lista de atividades escolhidas: pelo menos uma, sem repetição e todas existentes.
  function validarAtividades(lista, eventos) {
    if (!Array.isArray(lista) || !lista.length) return false;
    const ids = new Set(eventos.map((e) => e.id));
    return new Set(lista).size === lista.length && lista.every((id) => ids.has(id));
  }

  function mensagemLembrete(aluno, ev, nomeEvento, minutos) {
    const primeiro = normalizarNome(aluno.nome).split(" ")[0];
    const hora = String(ev.horario).split(/[–-]/)[0].trim();
    return `Olá, ${primeiro}! ⏰ Faltam ${minutos || 30} minutos para "${ev.titulo}" na ${nomeEvento}.\n` +
      `🕗 Início: ${hora}\n📍 Local: ${ev.sala}\n` +
      `Leve o QR Code do seu ingresso para o check-in. Até já!`;
  }

  return {
    soDigitos, validarCPF, validarEmail, validarTelefone, validarNome, validarMatricula,
    aplicarMascara, mascaraCPF, mascaraTelefone, mascaraMatricula,
    normalizarNome, capitalizarNome, normalizarEmail, mascararCPFParaExibicao,
    calcularHoras, atividadesMinimas, situacaoAluno,
    sha256Hex, gerarTokenIngresso, lerTokenIngresso, gerarCodigoCertificado,
    inicioEvento, eventosParaLembrete, telefoneE164, mensagemLembrete, recebeLembrete, validarAtividades,
    validarSenha, gerarSalt, hashSenha,
    escaparHTML, gerarId
  };
});

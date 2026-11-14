# Arquitetura técnica — S.G.J.A

## 1. Visão geral

```
 Navegador (aluno / comissão / professor)
 ┌──────────────────────────────────────────────────────────┐
 │  Páginas HTML5 + Bootstrap 5 (CSP: só scripts do site)    │
 │  inscricao.js · checkin.js · painel.js · certificado-pdf  │
 │                │                                          │
 │           js/api.js                                       │
 │      ┌─────────┴────────────────────┐                     │
 │  modo "local" (demonstração)   modo "servidor"            │
 │  js/servico.js + localStorage  só chamadas HTTPS à API    │
 └────────────────────────────────┬─────────────────────────┘
                                  │ HTTPS + token por perfil
         ┌────────────────────────┴───────────────┐
         │ servicos/api-gateway (Node/Express)     │──► SMTP (certificado)
         │ js/servico.js = regras e permissões     │──► WhatsApp (lembretes)
         │ segredos e senhas só no .env            │
         └────────────────────────┬───────────────┘
                                  ▼
                 arquivos em dados/  ou  Base44
```

- **Front-end:** HTML5, CSS3, JavaScript puro, Bootstrap 5, Bootstrap Icons, fonte Montserrat.
- **Bibliotecas:** jsPDF (PDF), qrcodejs (gerar QR), html5-qrcode (ler QR pela câmera), EmailJS (opcional).
- **Back-end:** servidor Node.js/Express com login por perfil; dados em arquivos ou no Base44; e-mail com Nodemailer.
- **Padrão de projeto:** *Adapter*. As telas falam só com `SGJA_API`. Trocar o banco (local ↔ Base44) é uma linha em `config.js`.

## 2. Modelo de dados (Squad 3)

| Tabela | Campos-chave | Regras |
|---|---|---|
| **Aluno** | id, nome, email, telefone, cpf, matricula, curso, periodo, atividades[] (sessão da apresentação, para o lembrete), consentimentoLGPD, aceitaWhatsApp, tokenIngresso | `cpf` e `email` únicos (o mesmo CPF é reaproveitado em vários trabalhos) |
| **Frequencia** | id, alunoId → Aluno, eventoId (EV01…EV06), checkIn, timestamp, origem, registradoPorId → MembroComissao | par (alunoId, eventoId) único |
| **Certificado** | id, alunoId → Aluno, nome, curso, horas, atividades[], trabalhos[] {titulo, modalidade}, codigo, emitidoEm, enviadoPorEmail, enviadoEm | um por aluno; `codigo` único |
| **EmailEnviado** | para, assunto, anexo, codigo, status | log de auditoria dos envios |
| **Trabalho** | protocolo, titulo, vinculo, vinculoNome, modalidade, curso, orientadores[], resumo, arquivo {nome, tipo, tamanho, ref}, representanteId → Aluno, autoresIds[] → Aluno, status, parecer, sessao, horarioApresentacao, apresentado | APIExt I/III/V → banner; II/IV/VI → oral; título único por participante |
| **MembroComissao** | nome, email, cpf, telefone, senhaHash, salt, status (pendente/ativo/bloqueado) | e-mail e CPF únicos; só `ativo` registra presença |
| **LembreteWhatsApp** | chave (alunoId:eventoId), alunoId → Aluno, eventoId, telefone, status, tentativas, idProvedor, erro, enviadoEm | chave única: um lembrete por aluno e atividade |

Relacionamentos: Trabalho N—N Aluno (`autoresIds`, um deles é o `representanteId`); Aluno 1—N Frequencia; Aluno 1—1 Certificado;
Aluno 1—N LembreteWhatsApp; MembroComissao 1—N Frequencia (`registradoPorId`).

A programação (EV01…EV06) não é uma tabela: fica em `js/config.js`, a mesma fonte para o site, o servidor e o certificado.
Assim não há duas versões dos horários para manter iguais.

O projeto do Base44 está em `base44/` (formato do CLI oficial): `base44/config.jsonc` e uma entidade por arquivo em
`base44/entities/*.jsonc`. Para criar tudo no Base44, veja [`docs/base44.md`](base44.md). O teste `tests/base44.test.js`
confere que cada registro que o sistema grava cabe exatamente nesses esquemas.

## 3. API (Squad 3)

As regras de negócio ficam em `js/servico.js` e são as mesmas nos dois modos:

- **Modo `local`** (demonstração): rodam no navegador, sobre o `localStorage`.
- **Modo `servidor`** (evento real): rodam no servidor (`servicos/api-gateway`), que é a barreira de segurança. O site só chama a API.

| Perfil | Rotas (prefixo `/api/v1`) | O que devolve |
|---|---|---|
| Público | `GET /publico/resumo`, `POST /publico/submissoes`, `GET /publico/certificados/:codigo` | total de participantes, protocolo e ingresso do representante, dados públicos do certificado |
| Participante (CPF + e-mail) | `POST /publico/participante`, `POST /publico/certificado`, `POST /publico/certificado/email` | só os próprios dados e certificado |
| Comissão (login) | `POST /comissao/cadastro`, `POST /comissao/login`, `GET /comissao/chamada`, `POST /comissao/checkin`, `POST /comissao/checkin/remover` | lista da chamada com CPF mascarado |
| Organização (login) | `POST /professor/login`, `GET /professor/dados`, `PUT /professor/trabalhos/:id`, `GET /professor/trabalhos/:id/arquivo`, `PUT /professor/membros/:id`, `POST /professor/certificados/:alunoId[/email]`, `GET /professor/lembretes/agenda` | tudo |

Detalhes de autenticação, limites e cabeçalhos em [`seguranca.md`](seguranca.md).

## 4. Algoritmos

**Validação de CPF (módulo 11):** multiplica os 9 primeiros dígitos por pesos 10…2, soma, `(soma × 10) mod 11` (10 vira 0) = 1º dígito verificador. Repete com 10 dígitos e pesos 11…2 para o 2º. CPFs com todos os dígitos iguais são rejeitados.

**Cálculo de horas:** para o aluno, percorre as frequências, conta cada atividade uma única vez e soma a `cargaHoraria`. Atividade inexistente é ignorada.

**Critério do certificado:** participar de pelo menos 1 dia do evento (ter check-in em alguma atividade daquele dia). Quem cumpre recebe o certificado da carga total do evento (20 horas). O número de dias fica em `evento.diasMinimosCertificado`. O verso lista toda a programação, com a coluna de presença.

**QR Code do ingresso:** `SGJA|<alunoId>|<assinatura>`, onde `assinatura = SHA-256(alunoId|cpf|segredo)` (16 primeiros caracteres). Um QR forjado ou de outra pessoa é rejeitado na leitura.

**Código do certificado:** `SHA-256(CERT|alunoId|cpf|horas|segredo)` → 12 caracteres em `XXXX-XXXX-XXXX`. Fica gravado na tabela Certificado e impresso no PDF com um QR Code que abre `validar.html?codigo=…`.

**Lembrete WhatsApp:** a cada minuto, seleciona as atividades com `início − 30 min ≤ agora < início` (fuso −03:00). Envia só para quem tem `aceitaWhatsApp` e a atividade em `atividades` (`recebeLembrete` em `js/core.js`); a chave `alunoId:eventoId` garante envio único; falhas são tentadas de novo até 3 vezes.

**Envio em lote:** fila com os aptos que ainda não receberam. Gera o PDF, envia, marca `enviadoPorEmail`. Se algum falhar, rodar de novo só reenvia os que faltaram.

## 5. Certificado em PDF (Squad 4)

1. `assets/img/certificado-base.jpg` é o modelo oficial com o texto fixo apagado (por *inpainting*), mantendo logo, título, linhas de assinatura e moldura.
2. `js/certificado-pdf.js` abre um A4 paisagem, coloca o fundo e escreve nas posições do modelo (pixels da imagem 1491×1055 convertidos para mm):
   - nome do aluno em caixa alta (a fonte reduz sozinha para nomes longos);
   - parágrafo com evento, datas e **carga horária realmente cumprida** em negrito;
   - curso e CPF mascarado;
   - data, nomes e cargos das assinaturas (configuráveis);
   - no verso: programação completa do evento (todas as atividades ofertadas, carga de cada uma e total de 20 horas, para o Currículo Lattes), coluna de presença do participante, QR Code e código de autenticidade.
3. O fundo está embutido em `js/certificado-base64.js`, então o PDF é gerado até abrindo o HTML direto do disco.

## 6. Segurança e LGPD

| Ameaça | Proteção |
|---|---|
| Dados inválidos | máscaras + validação no front **e** de novo na camada de API |
| Inscrição duplicada | CPF, e-mail e matrícula únicos (validado no servidor, resposta 409) |
| Clique duplo / envio repetido | botão desativado + trava por operação em `api.js` |
| Robôs | campo-armadilha invisível no formulário |
| XSS | todo dado do usuário passa por `escaparHTML` ou `textContent` antes de ir para a tela |
| Injeção de fórmula no CSV | células que começam com `= + - @` recebem apóstrofo |
| Acesso ao painel do professor | PIN com hash SHA-256 (nunca em texto puro), sessão com expiração, bloqueio de 60s após 5 erros |
| Acesso ao check-in | conta individual por membro da comissão; senha guardada só como PBKDF2-SHA256 (100 mil repetições, salt aleatório); conta nasce pendente e só funciona depois de liberada por um professor; bloqueio vale na hora (conferido a cada registro); 5 erros de senha bloqueiam por 60s; mensagem de erro igual para e-mail inexistente e senha errada; cada presença guarda quem a registrou |
| QR Code falsificado | assinatura SHA-256 com segredo |
| Certificado falso | código único validável publicamente |
| Chave do Base44 exposta | o site nunca fala com o Base44; a chave fica só no `.env` do servidor |
| Abuso da API | limite de 60 requisições/minuto por IP, CORS restrito, payload máximo de 3 MB, anexo precisa começar com `%PDF` |
| Cabeçalhos HTTP | `vercel.json`/`netlify.toml` com `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| LGPD | consentimento obrigatório, CPF mascarado nas telas e no PDF, finalidade explicada no formulário |

**Trocar o PIN do painel:**

```bash
node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('NOVO_PIN')).then(b=>console.log(Buffer.from(b).toString('hex')))"
```

Cole o resultado em `painel.pinHash` no `js/config.js`.

**Limite conhecido:** no modo `local`, os dados ficam no navegador de quem usa, e o PIN é conferido no próprio navegador. Isso serve só para demonstração. No evento, use `backend: "servidor"` (passo a passo em [`seguranca.md`](seguranca.md)).

## 7. Usabilidade e acessibilidade

- Layout responsivo (testado em 390 px de largura sem rolagem horizontal).
- Feedback imediato: campo verde/vermelho, mensagem do erro, avisos (toasts), bipe no check-in.
- Teclados certos no celular (`inputmode="numeric"` e `email`), `autocomplete` nos campos.
- Rótulos (`label`) em todos os campos, `aria-live` nos resultados, foco movido para o ingresso após a inscrição.
- Check-in em 3 formas: caixa de seleção, CPF + Enter (totem) e QR Code.

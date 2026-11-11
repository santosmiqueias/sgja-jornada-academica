# Arquitetura técnica — S.G.J.A

## 1. Visão geral

```
 Navegador (aluno / professor)
 ┌──────────────────────────────────────────────────────────┐
 │  Páginas HTML5 + Bootstrap 5                              │
 │  inscricao.js · painel.js · certificado-pdf.js · email.js │
 │                │                                          │
 │           js/api.js  (API única usada pelas telas)        │
 │      ┌─────────┴──────────┐                               │
 │  LocalStore           Base44Store                         │
 │  (localStorage)       (REST)                              │
 └──────────────────────────┬───────────────────────────────┘
                            │ HTTPS
         ┌──────────────────┴───────────────────┐
         │ servicos/api-gateway (Node/Express)   │──► SMTP (envio do PDF)
         │ guarda a chave do Base44 no servidor  │
         └──────────────────┬───────────────────┘
                            ▼
                     Base44 (banco na nuvem)
```

- **Front-end:** HTML5, CSS3, JavaScript puro, Bootstrap 5, Bootstrap Icons, fonte Montserrat.
- **Bibliotecas:** jsPDF (PDF), qrcodejs (gerar QR), html5-qrcode (ler QR pela câmera), EmailJS (opcional).
- **Back-end:** Base44 (tabelas) + microsserviço Node.js/Express (proxy e e-mail com Nodemailer).
- **Padrão de projeto:** *Adapter*. As telas falam só com `SGJA_API`. Trocar o banco (local ↔ Base44) é uma linha em `config.js`.

## 2. Modelo de dados (Squad 3)

| Tabela | Campos-chave | Regras |
|---|---|---|
| **Aluno** | id, nome, email, telefone, cpf, matricula, curso, periodo, atividades[] (ids dos eventos escolhidos), consentimentoLGPD, aceitaWhatsApp, tokenIngresso | `cpf`, `email` e `matricula` únicos |
| **Evento** | codigo (EV01…EV06), titulo, data, turno, horario, sala, cargaHoraria | soma das cargas = 20h |
| **Frequencia** | id, alunoId → Aluno, eventoId → Evento, checkIn, timestamp, origem | par (alunoId, eventoId) único |
| **Certificado** | id, alunoId → Aluno, horas, codigo, emitidoEm, enviadoPorEmail | um por aluno; `codigo` único |
| **EmailEnviado** | para, assunto, anexo, codigo, status | log de auditoria dos envios |
| **LembreteWhatsApp** | chave (alunoId:eventoId), telefone, status, tentativas | chave única: um lembrete por aluno e atividade |

Relacionamentos: Aluno N—N Evento (inscrição, campo `atividades`); Aluno 1—N Frequencia N—1 Evento; Aluno 1—1 Certificado.

Os esquemas prontos para o Base44 estão em `base44/*.json`. No Base44, crie cada entidade com esses campos.
O catálogo de eventos também está em `js/config.js` (fonte usada pelo site).

## 3. API (Squad 3)

### 3.1 API interna (`js/api.js`)

| Operação | Equivalente REST | Regra |
|---|---|---|
| `criarAluno(dados)` | `POST /alunos` | valida tudo de novo, bloqueia CPF/e-mail/matrícula duplicados, trava contra clique duplo |
| `listarAlunos()` | `GET /alunos` | ordenado por nome |
| `buscarAlunoPorCPF(cpf)` | `GET /alunos?cpf=` | |
| `registrarCheckin(alunoId, eventoId, origem)` | `POST /frequencias` | idempotente: não duplica presença |
| `removerCheckin(alunoId, eventoId)` | `DELETE /frequencias/:id` | |
| `validarIngresso(qr)` | `POST /ingressos/validar` | confere a assinatura do QR |
| `situacao(alunoId)` | `GET /alunos/:id/situacao` | horas, mínimo, aprovado |
| `salvarCertificado(aluno, horas)` | `POST /certificados` | gera código de autenticidade |
| `buscarCertificadoPorCodigo(c)` | `GET /certificados/:codigo` | validação pública |

### 3.2 Microsserviço (`servicos/api-gateway`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | status do serviço |
| GET | `/api/v1/entidades/:entidade` | lista registros do Base44 |
| POST | `/api/v1/entidades/:entidade` | cria registro (com bloqueio de CPF/e-mail duplicado → **409**) |
| PUT | `/api/v1/entidades/:entidade/:id` | atualiza registro |
| POST | `/api/v1/certificados/enviar` | `{ para, nome, assunto, mensagem, arquivo, pdfBase64 }` → envia por SMTP |
| GET | `/api/v1/lembretes/agenda` | horário de envio de cada lembrete WhatsApp e quantos já saíram |

O servidor também roda o **agendador de lembretes por WhatsApp** (detalhes em `docs/whatsapp.md`).

Para rodar: `cd servicos/api-gateway && npm install && cp .env.example .env` (preencha) `&& npm start`.

## 4. Algoritmos

**Validação de CPF (módulo 11):** multiplica os 9 primeiros dígitos por pesos 10…2, soma, `(soma × 10) mod 11` (10 vira 0) = 1º dígito verificador. Repete com 10 dígitos e pesos 11…2 para o 2º. CPFs com todos os dígitos iguais são rejeitados.

**Cálculo de horas:** para o aluno, percorre as frequências, conta cada atividade uma única vez e soma a `cargaHoraria`. Atividade inexistente é ignorada.

**Critério do certificado:** `minimo = teto(total de atividades × 50 / 100)`. Com 6 atividades → 3. Aprovado se o aluno tem check-in em `≥ minimo` atividades diferentes (presença repetida na mesma atividade conta uma vez). A carga horária impressa no certificado é a soma das horas das atividades com check-in.

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
   - QR Code e código de autenticidade.
3. O fundo está embutido em `js/certificado-base64.js`, então o PDF é gerado até abrindo o HTML direto do disco.

## 6. Segurança e LGPD

| Ameaça | Proteção |
|---|---|
| Dados inválidos | máscaras + validação no front **e** de novo na camada de API |
| Inscrição duplicada | CPF, e-mail e matrícula únicos (API local e microsserviço com 409) |
| Clique duplo / envio repetido | botão desativado + trava por operação em `api.js` |
| Robôs | campo-armadilha invisível no formulário |
| XSS | todo dado do usuário passa por `escaparHTML` ou `textContent` antes de ir para a tela |
| Injeção de fórmula no CSV | células que começam com `= + - @` recebem apóstrofo |
| Acesso ao painel | PIN com hash SHA-256 (nunca em texto puro), sessão com expiração, bloqueio de 60s após 5 erros |
| QR Code falsificado | assinatura SHA-256 com segredo |
| Certificado falso | código único validável publicamente |
| Chave do Base44 exposta | em produção o front chama o microsserviço; a chave fica no `.env` do servidor |
| Abuso da API | limite de 60 requisições/minuto por IP, CORS restrito, payload máximo de 3 MB, anexo precisa começar com `%PDF` |
| Cabeçalhos HTTP | `vercel.json`/`netlify.toml` com `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| LGPD | consentimento obrigatório, CPF mascarado nas telas e no PDF, finalidade explicada no formulário |

**Trocar o PIN do painel:**

```bash
node -e "crypto.subtle.digest('SHA-256', new TextEncoder().encode('NOVO_PIN')).then(b=>console.log(Buffer.from(b).toString('hex')))"
```

Cole o resultado em `painel.pinHash` no `js/config.js`.

**Limite conhecido:** no modo `local`, os dados ficam no navegador de quem usa, e o PIN é conferido no próprio navegador. Isso serve para demonstração. Em produção, use `backend: "base44"` com o microsserviço e a autenticação de usuários do próprio Base44.

## 7. Usabilidade e acessibilidade

- Layout responsivo (testado em 390 px de largura sem rolagem horizontal).
- Feedback imediato: campo verde/vermelho, mensagem do erro, avisos (toasts), bipe no check-in.
- Teclados certos no celular (`inputmode="numeric"` e `email`), `autocomplete` nos campos.
- Rótulos (`label`) em todos os campos, `aria-live` nos resultados, foco movido para o ingresso após a inscrição.
- Check-in em 3 formas: caixa de seleção, CPF + Enter (totem) e QR Code.

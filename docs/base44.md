# Base44: banco de dados do S.G.J.A (Squad 3)

O Base44 guarda os dados do evento real. Quem fala com ele é só o servidor (`servicos/api-gateway`):

```
Site (GitHub Pages) ──HTTPS──> Servidor Node (regras, login, validação) ──chave de API──> Base44 (entidades)
```

O site nunca recebe a chave do Base44, e as entidades só aceitam leitura e gravação de administradores do app.
Assim, mesmo quem descobrir o endereço do app no Base44 não consegue ler CPF, e-mail ou telefone dos participantes.

## O que fica no repositório

| Arquivo | Para que serve |
|---|---|
| `base44/config.jsonc` | nome e descrição do app; visibilidade `private` |
| `base44/entities/*.jsonc` | as 7 entidades, com tipos, valores permitidos e regras de acesso (`rls`) |
| `tests/base44.test.js` | confere que tudo o que o sistema grava cabe nesses esquemas |

## Entidades

| Entidade | O que guarda | Ligações |
|---|---|---|
| **Aluno** | participante (representante ou coautor): nome, CPF, e-mail, telefone, curso, autorização de WhatsApp, QR Code | — |
| **Trabalho** | submissão: título, vínculo (APIExt I–VI, PIC, TCC…), modalidade, orientadores, resumo, arquivo, resultado da banca, sessão | `representanteId` e `autoresIds[]` → Aluno |
| **Frequencia** | um check-in por participante e atividade | `alunoId` → Aluno, `registradoPorId` → MembroComissao |
| **Certificado** | certificado emitido: horas, atividades com presença, trabalhos apresentados, código de autenticidade | `alunoId` → Aluno |
| **MembroComissao** | cadastro de quem faz check-in: senha guardada só como hash (PBKDF2), situação pendente/ativo/bloqueado | — |
| **EmailEnviado** | registro de cada envio de certificado por e-mail | `codigo` → Certificado |
| **LembreteWhatsApp** | registro de cada lembrete enviado, para não repetir mesmo se o servidor reiniciar | `alunoId` → Aluno |

A programação (EV01 a EV06) fica em `js/config.js`, a mesma fonte para o site, o servidor e o certificado.

## Verificado no Base44 (14/11/2026)

- As 7 entidades foram criadas com `npm run base44:push`.
- Visitante sem login: a listagem volta vazia, a busca por id dá "não encontrado" (404), e criar ou alterar dá "permissão negada" (403).
  Só o administrador do app vê e grava.
- O Base44 **não** aplica `pattern` nem `maxLength` (aceitou um CPF "123"). Esses campos documentam o formato, e quem garante o formato
  é o servidor (`js/core.js` e `js/servico.js`), que valida tudo antes de gravar.
- Campos nunca preenchidos voltam como `null`. O `Base44Store` remove esses `null`, então o código vê o mesmo formato do armazenamento em arquivos.
- O push remove do app as entidades que não estão em `base44/entities/`. No app novo isso apagou só o exemplo `User` do modelo inicial;
  o usuário padrão do Base44 (login e papel de administrador) continua funcionando.

- Teste de ponta a ponta com o app real (demonstração completa: 5 trabalhos, banca, 11 check-ins, 9 certificados e e-mails,
  comissão): tudo gravado e lido certo, membro duplicado recusado (409), e-mail errado recusado, certificado validado.
  Os dados do teste foram apagados no final.

## Limite de requisições do Base44

No plano base, o Base44 aceita por minuto: 70 listagens, 80 criações e 70 alterações (o seu plano pode multiplicar isso).
As regras do sistema releem as tabelas a cada operação, então o `Base44Store` guarda uma cópia em memória:

- o servidor é o único que grava, então a cópia é atualizada a cada gravação, sem reler;
- a cópia é relida do Base44 a cada 60 segundos (`BASE44_CACHE_SEGUNDOS`), para pegar edições feitas direto no painel do Base44;
- se o Base44 responder 429 (limite) ou 503, o servidor espera o tempo pedido e tenta de novo, até 5 vezes.

Uma submissão com 10 participantes faz cerca de 21 gravações, então em um pico de envios algumas respostas podem demorar
alguns segundos a mais, mas não se perdem.

## Regras que o Base44 não faz sozinho (e onde estão)

- **CPF e e-mail únicos.** O Base44 não tem campo único. A regra fica em `js/servico.js`: na submissão,
  um CPF que já existe é reaproveitado (a mesma pessoa pode estar em vários trabalhos), mas se o e-mail não bater
  com o daquele CPF, ou se o e-mail já for de outro CPF, a submissão é recusada (HTTP 409). Na comissão, e-mail e CPF repetidos
  também são recusados. As operações passam por uma trava (`comTrava`), então dois envios ao mesmo tempo não criam duplicados.
  Por isso, rode **uma única instância** do servidor.
- **Mesmo título duas vezes.** Recusado para os mesmos participantes.
- **Check-in repetido.** Não cria um segundo registro de Frequencia.
- **Horas do certificado.** Calculadas no servidor a partir das presenças, nunca enviadas pelo navegador.

## Criar tudo no Base44 (uma vez, na máquina de quem é dono do app)

Precisa de Node 18 ou mais novo e de uma conta no Base44. Na raiz do repositório:

```bash
npm install
```

```bash
npm run base44:login
```

```bash
npm run base44:create
```

O `base44:create` cria o app "SGJA VI Jornada Academica" e grava o id dele em `base44/.app.jsonc` (esse arquivo não vai
para o Git). Se o app já existe, use `npm run base44:link` e escolha o app na lista.

```bash
npm run base44:push
```

O `base44:push` cria ou atualiza as 7 entidades. Rode de novo sempre que mudar um arquivo de `base44/entities/`.

## Ligar o servidor ao Base44

1. No Base44, crie uma **chave de API pessoal** (ou token de acesso pessoal) com **acesso total** (*full access*),
   na conta dona do app. Ela age como você, que é administrador do app, então passa pela regra "só administrador".
   Uma chave de API do workspace também funciona (age como o dono do workspace). Chave **somente leitura não serve**:
   o servidor precisa gravar. O id do app está em `base44/.app.jsonc` e no endereço do painel do app.
2. No `.env` do servidor (`servicos/api-gateway/.env`, nunca no site e nunca no Git):

   ```
   BASE44_APP_ID=id-do-app
   BASE44_API_KEY=chave-de-api
   ```

3. Reinicie o servidor. Com as duas variáveis preenchidas ele usa o Base44; sem elas, guarda em arquivos na pasta `dados/`.
4. Em `js/config.js`, use `backend: "servidor"` e o endereço HTTPS do servidor.

## Conferir

```bash
npm test
```

O teste `tests/base44.test.js` gera dados de demonstração (submissões, banca, check-in, comissão, certificados, e-mails
e lembretes) e confere cada registro contra os esquemas: tipos, valores permitidos, formato do CPF, do protocolo e do código,
campos obrigatórios e campos fora do esquema. Se alguém mudar o código e esquecer o esquema (ou o contrário), o teste falha.

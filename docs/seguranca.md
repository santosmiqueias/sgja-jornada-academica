# Segurança do S.G.J.A — auditoria, correções e como publicar com segurança

Auditoria feita em 11/11/2026. Cada falha foi primeiro **comprovada com um ataque real**, depois corrigida e, por fim, coberta por um teste automático que repete o ataque (`servicos/api-gateway/test/seguranca.test.js`).

## 1. Falhas encontradas e corrigidas

| # | Gravidade | Falha | Como foi comprovada | Correção |
|---|---|---|---|---|
| 1 | Crítica | O servidor devolvia a lista inteira de inscritos (CPF, e-mail, telefone) e aceitava alterações sem login (`/api/v1/entidades/*`) | leitura do código das rotas | Rotas genéricas removidas. Cada rota tem perfil (público, comissão, professor) e devolve só os campos necessários |
| 2 | Crítica | A configuração previa colocar a chave do Base44 no site (`js/config.js`), visível a qualquer visitante | leitura da configuração | A chave sai do site e fica só no `.env` do servidor. O site nunca fala direto com o Base44 |
| 3 | Alta | O envio de e-mail aceitava qualquer destinatário: o servidor podia disparar spam | leitura do código | O destino é sempre o e-mail da inscrição, o texto é montado pelo servidor, o anexo precisa ser PDF e há limite de envios |
| 4 | Alta | "Meu certificado" mostrava os dados e o **QR Code do ingresso** de qualquer pessoa só com o CPF dela, o que permitia fazer check-in no lugar dela | consulta com CPF de terceiro | A consulta exige CPF **e** e-mail da inscrição, e 5 erros para o mesmo CPF bloqueiam por 15 minutos |
| 5 | Alta | O PIN do professor era descoberto em **15 ms** a partir do código publicado, e a sessão podia ser forjada no navegador | força bruta nas 10.000 combinações; sessão criada pelo console | No modo servidor, a senha do professor é conferida pelo servidor (hash scrypt no `.env`), a sessão é um token assinado e há bloqueio após 5 erros |
| 6 | Alta | O segredo que assina QR Codes e certificados estava publicado: dava para falsificar ingressos | geração de um QR válido para qualquer participante | No modo servidor, o segredo fica no `.env` (`ASSINATURA_SEGREDO`) e o QR é conferido no servidor |
| 7 | Média | Bibliotecas com falhas conhecidas: Express 4.21.2 (4 de gravidade alta, no `qs`), Nodemailer 6.9.16 (envio a domínio errado e outras) e jsPDF 2.5.1 | `npm audit` e avisos públicos | Express 4.22.3, Nodemailer 10.2.1 e jsPDF 4.2.1. O `npm audit` mostra **0 vulnerabilidades** |
| 8 | Média | Sem política de segurança de conteúdo (CSP), com scripts escritos dentro do HTML | leitura das páginas | Scripts movidos para arquivos. CSP em todas as páginas: só roda script do próprio site, sem objetos embutidos e sem frames |
| 9 | Baixa | O painel exportava `inscritos.json` com nomes e telefones | leitura do código | Exportação removida. Os lembretes leem os inscritos direto do servidor |

**Sem falha encontrada:** injeção de código nas telas (XSS). Todo texto vindo de usuários passa por `escaparHTML` ou `textContent`, e o CSV exportado é protegido contra fórmulas do Excel.

## 2. Como o sistema se protege agora (modo servidor)

- **Quem vê o quê**
  - *Visitante:* total de inscritos e validação de certificado (nome, curso, horas e atividades, sem CPF).
  - *Participante:* só os próprios dados, depois de informar CPF e e-mail da inscrição.
  - *Comissão:* lista da chamada com nome, matrícula, curso e **CPF mascarado** (sem e-mail e sem telefone).
  - *Professor:* tudo, depois de login com senha.
- **Senhas:** a do professor fica guardada como hash scrypt e a da comissão como PBKDF2-SHA256 com 100 mil repetições. Nenhuma senha fica salva em texto.
- **Sessões:** token assinado com HMAC-SHA256, com validade (professor 2h, comissão 4h). Um token adulterado ou vencido é recusado.
- **Bloqueio na hora:** membro bloqueado pelo professor perde o acesso na próxima requisição, mesmo com token válido.
- **Força bruta:** limite por IP em todas as rotas, e 5 erros bloqueiam por 15 minutos a conta do professor, de cada membro e de cada CPF consultado.
- **Integridade:** horas e atividades do certificado são calculadas pelo servidor a partir das presenças. Quem pede não consegue impor "20 horas".
- **Entradas:** tudo é validado de novo no servidor, com tamanho máximo de 20 KB (3 MB só para o PDF) e campos fora da lista ignorados.
- **Transporte e navegador:** CORS só para o endereço do site e cabeçalhos `X-Frame-Options`, `nosniff`, CSP, `no-store` e HSTS (em HTTPS).
- **Arquivos de dados:** gravados com permissão só do dono (600), com troca atômica para não corromper.

## 3. Publicar o evento com segurança (passo a passo)

1. **Servidor** (Render, Railway ou um computador da faculdade com HTTPS):

   ```bash
   cd servicos/api-gateway
   npm install
   cp .env.example .env
   node gerar-hash.js "uma senha forte do professor"
   ```

   Cole as três linhas geradas (`PROFESSOR_SENHA_HASH`, `TOKEN_SEGREDO`, `ASSINATURA_SEGREDO`) no `.env`, preencha `ORIGENS_PERMITIDAS` com o endereço do site e rode `npm start`.

2. **Site:** em `js/config.js`, troque `backend: "local"` por `backend: "servidor"` e coloque em `servidor.url` o endereço **HTTPS** do servidor. Depois rode `npm run versao` e publique.

3. **Antes do evento:**
   - deixe `ALLOW_DEMO=false` e `ALLOW_RESET=false`;
   - nunca suba o `.env` para o GitHub (ele já está no `.gitignore`);
   - rode `npm run test:servidor`, que deve terminar com 17 de 17 testes passando.

## 4. Limites conhecidos (seja transparente na apresentação)

- **Modo `local` é só demonstração.** Os dados ficam no navegador do aparelho e o PIN `2026` e o segredo de demonstração estão no código. O painel e o check-in mostram o aviso "Modo demonstração". **Não use com dados reais.**
- **GitHub Pages não envia cabeçalhos HTTP.** Por isso a proteção contra o site ser exibido dentro de outro (clickjacking) depende do servidor da API ou de Netlify/Vercel, onde `netlify.toml` e `vercel.json` já configuram isso. A CSP vai nas próprias páginas.
- **Limites de tentativas ficam na memória do servidor.** Se o servidor reiniciar, a contagem recomeça. Para vários servidores ao mesmo tempo, use um banco compartilhado (por exemplo, Redis).
- **Verificar se o CPF já está inscrito** (aviso na inscrição) revela só "sim ou não", sem nenhum dado da pessoa, e tem limite de 20 consultas por minuto.

## 5. Como repetir a auditoria

```bash
npm test
```

```bash
npm run test:servidor
```

```bash
cd servicos/api-gateway && npm audit --omit=dev
```

São 22 testes de regras e 17 de ataque ao servidor, e o `npm audit` deve mostrar 0 vulnerabilidades.

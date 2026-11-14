# S.G.J.A — Sistema de Gestão da Jornada Acadêmica

Site oficial da **6ª Jornada Acadêmica da UNINASSAU Teresina** (09 e 10 de dezembro de 2026).
Resolve a dor do cliente (Prof. Edson): acabar com Google Forms e listas de papel, e unificar
**Inscrição → Check-in → Certificado** num só sistema.

| Módulo | Página | O que faz |
|---|---|---|
| Página inicial | `index.html` | Tema, sobre o evento (edital), como funciona, formatos de apresentação, doação de alimento, programação e cronograma oficiais, dúvidas |
| Submissão | `submissao.html` (menu Submissão) | Representante envia o trabalho: título, vínculo/disciplina (APIExt I–VI, PIC, TCC, outras, externo), formato, resumo de até 1.500 caracteres, **arquivo (PDF/DOC/DOCX, até 10 MB)** e dados de todos os participantes. Edital para visualizar e baixar |
| Meu certificado | `certificado.html` | Com CPF + e-mail: resultado da banca, parecer, dia e horário da apresentação, ingresso (QR Code) e certificado |
| Check-in | `checkin.html` (menu Check-in) | Acesso individual da comissão organizadora (cadastro liberado pela organização): chamada, CPF, QR Code |
| Organização | `painel.html` (link "Organização" no topo) | Submissões e banca (baixar arquivo, aprovar/recusar, parecer, sessão, "apresentado"), participantes, certificados, lembretes, comissão, dados |
| Validação | `validar.html` | Confere a autenticidade do certificado, com os trabalhos apresentados |

**Certificado:** 20 horas para quem participar de pelo menos 1 dia do evento (check-in). O verso traz a programação oficial, a presença e os trabalhos apresentados (confirmados pela organização).

## Como rodar

O site é estático (HTML5, CSS3, JavaScript, Bootstrap 5). As bibliotecas ficam em `vendor/`,
então funciona até sem internet.

```bash
npm start
```

Abra http://localhost:5500. No VS Code, a extensão **Live Server** também funciona.

- **Organização (demonstração):** PIN `2026`
- **Comissão de exemplo (check-in):** `comissao@exemplo.com`, senha `jornada2026` (criada pelo botão de dados de demonstração)
- No painel, aba **Dados → Popular dados de demonstração** cria 10 alunos com presenças variadas.

Testes automatizados das regras de negócio:

```bash
npm test
```

## Publicar (Squad 5)

Antes de cada publicação, rode `npm run versao`. Ele atualiza o número de versão dos arquivos CSS e JS nas páginas, e assim o navegador de quem já visitou o site baixa a versão nova em vez de usar a cópia antiga.


- **Netlify:** arraste a pasta do projeto em https://app.netlify.com/drop. Pronto.
- **Vercel:** `npx vercel` na pasta do projeto (o `vercel.json` já configura cabeçalhos de segurança).
- **GitHub Pages:** suba o repositório → Settings → Pages → Branch `main` / root.

A câmera do leitor de QR Code só abre em **HTTPS** ou `localhost`. As três opções acima já entregam HTTPS.

## Configuração

Tudo fica em `js/config.js`:

- `backend`: `"local"` (**demonstração**: dados no navegador, PIN 2026) ou `"servidor"` (**evento real**: login por perfil e dados protegidos no servidor). Veja [`docs/seguranca.md`](docs/seguranca.md).
- `servidor.url`: endereço HTTPS do servidor (`servicos/api-gateway`).
- `evento.diasMinimosCertificado`: 1 = quem participar de pelo menos 1 dia recebe o certificado de 20 horas (carga total do evento).
- `eventos`: atividades, datas e carga horária.
- `evento.assinaturas`: nomes do reitor e do coordenador no certificado.

Senhas, segredos e a chave do Base44 **nunca** ficam no site: no modo servidor, eles ficam no `.env` do servidor.

## Segurança

Auditoria completa, com ataques reais e correções, em [`docs/seguranca.md`](docs/seguranca.md). Para repetir os testes de ataque:

```bash
npm run test:servidor
```

## Estrutura

```
index.html, inscricao.html, painel.html, certificado.html, validar.html
css/style.css              identidade visual (azul #0b2a6f + amarelo #f5c400)
js/config.js               configuração central
js/core.js                 regras puras: CPF, máscaras, horas, aprovação, assinaturas
js/servico.js              regras de negócio (as mesmas no navegador e no servidor)
js/api.js                  camada de dados: modo local (demonstração) ou servidor (com login)
js/inscricao.js            tela de inscrição
js/checkin.js              check-in da comissão organizadora (cadastro, login, chamada, QR Code)
js/painel.js               painel do professor (inscritos, certificados, lembretes, comissão, dados)
js/certificado-pdf.js      gerador do PDF (jsPDF)
js/certificado-base64.js   fundo do certificado embutido
assets/img/                logo, modelo original e fundo limpo do certificado
base44/                    esquemas das tabelas para criar no Base44
servicos/api-gateway/      servidor Node: API com login por perfil, dados (arquivos ou Base44), e-mail e lembretes WhatsApp
tests/                     testes unitários (node --test)
docs/                      arquitetura, Kanban, plano de testes, roteiro do pitch
```

## Documentação por Squad

- Squad 1 (Tech Lead): [`docs/kanban.md`](docs/kanban.md)
- Squads 2, 3 e 4 (Front, Back, PDF): [`docs/arquitetura.md`](docs/arquitetura.md)
- Lembretes por WhatsApp: [`docs/whatsapp.md`](docs/whatsapp.md)
- Squad 5 (QA, deploy e pitch): [`docs/testes-qa.md`](docs/testes-qa.md) e [`docs/pitch.md`](docs/pitch.md)

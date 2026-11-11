# S.G.J.A — Sistema de Gestão da Jornada Acadêmica

Site oficial da **VI Jornada Acadêmica da UNINASSAU Teresina** (09 e 10 de dezembro de 2026).
Resolve a dor do cliente (Prof. Edson): acabar com Google Forms e listas de papel, e unificar
**Inscrição → Check-in → Certificado** num só sistema.

| Módulo | Página | O que faz |
|---|---|---|
| Landing page | `index.html` | Identidade visual, programação, como funciona, perguntas frequentes |
| Inscrição | `inscricao.html` | Formulário com máscaras, validação de CPF (módulo 11), escolha das atividades, bloqueio de duplicados, consentimento LGPD, ingresso com QR Code |
| Check-in | `checkin.html` (menu Check-in) | Acesso individual da comissão organizadora: cada membro cria cadastro (e-mail e senha) e só entra depois que um professor libera. Chamada com caixas de seleção (mostra os inscritos na atividade), check-in por CPF (modo totem), leitor de QR Code pela câmera, presença em lote, contadores em tempo real, registro de quem confirmou cada presença |
| Comissão | `painel.html` → aba Comissão | Professor libera, bloqueia ou reativa cada membro da comissão e vê quantos check-ins cada um fez |
| Inscritos | `painel.html` → aba Inscritos | Lista com horas e situação, exportação CSV para Excel |
| Certificados | `painel.html` → aba Certificados / `certificado.html` | Libera com check-in em pelo menos 50% das atividades (3 de 6), PDF no modelo oficial com as horas cumpridas e, no verso, a relação das atividades com presença e a carga horária de cada uma, envio por e-mail individual ou em lote |
| Lembrete WhatsApp | `painel.html` → aba Lembretes + `servicos/api-gateway` | Mensagem automática 30 min antes de cada atividade, só para quem se inscreveu nela e autorizou ([guia](docs/whatsapp.md)) |
| Validação | `validar.html` | Qualquer pessoa confere se um certificado é verdadeiro (código ou QR Code impresso no PDF) |

## Como rodar

O site é estático (HTML5, CSS3, JavaScript, Bootstrap 5). As bibliotecas ficam em `vendor/`,
então funciona até sem internet.

```bash
npm start
```

Abra http://localhost:5500. No VS Code, a extensão **Live Server** também funciona.

- **PIN do painel do professor (demonstração):** `2026`
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

- `evento.percentualMinimoAtividades`: 50 = certificado para quem fez check-in em pelo menos metade das atividades (3 de 6).
- `eventos`: atividades, datas e carga horária.
- `backend`: `"local"` (salva no navegador, ideal para demonstração) ou `"base44"`.
- `email.modo`: `"simulado"`, `"microsservico"` (Node + SMTP) ou `"emailjs"`.
- `painel.pinHash`: hash SHA-256 do PIN (veja `docs/arquitetura.md`, seção Segurança).
- `evento.assinaturas`: nomes do reitor e do coordenador no certificado.

## Estrutura

```
index.html, inscricao.html, painel.html, certificado.html, validar.html
css/style.css              identidade visual (azul #0b2a6f + amarelo #f5c400)
js/config.js               configuração central
js/core.js                 regras puras: CPF, máscaras, horas, aprovação, assinaturas
js/api.js                  camada de dados (driver local ou Base44) + regras de proteção
js/inscricao.js            tela de inscrição
js/checkin.js              check-in da comissão organizadora (cadastro, login, chamada, QR Code)
js/painel.js               painel do professor (inscritos, certificados, lembretes, comissão, dados)
js/certificado-pdf.js      gerador do PDF (jsPDF)
js/email.js                envio do certificado por e-mail
js/certificado-base64.js   fundo do certificado embutido
assets/img/                logo, modelo original e fundo limpo do certificado
base44/                    esquemas das tabelas para criar no Base44
servicos/api-gateway/      microsserviço Node (proxy Base44, e-mail com SMTP, lembretes WhatsApp)
tests/                     testes unitários (node --test)
docs/                      arquitetura, Kanban, plano de testes, roteiro do pitch
```

## Documentação por Squad

- Squad 1 (Tech Lead): [`docs/kanban.md`](docs/kanban.md)
- Squads 2, 3 e 4 (Front, Back, PDF): [`docs/arquitetura.md`](docs/arquitetura.md)
- Lembretes por WhatsApp: [`docs/whatsapp.md`](docs/whatsapp.md)
- Squad 5 (QA, deploy e pitch): [`docs/testes-qa.md`](docs/testes-qa.md) e [`docs/pitch.md`](docs/pitch.md)

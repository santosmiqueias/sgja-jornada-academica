# Quadro Kanban — Squad 1 (Tech Lead & Scrum Master)

Copie os cartões para o Trello/Jira. Cada cartão tem dono (Squad), critério de pronto e o arquivo do código.

## Fluxo

**To Do → In Progress → Code Review → QA → Done**

Regra: nenhum cartão vai para Done sem passar pelo Squad 5 (QA).

## Backlog

| # | Cartão | Squad | Critério de pronto | Arquivo |
|---|---|---|---|---|
| 1 | Criar repositório no GitHub e convidar as 12 pessoas | 1 | repositório com README e branch `main` protegida | — |
| 2 | Definir padrão de branch (`feat/nome-da-tarefa`) e Pull Request | 1 | regra escrita no README | README.md |
| 3 | Recortar logo e aplicar paleta azul/amarelo | 2 | logo na landing, cores em variáveis CSS | css/style.css |
| 4 | Landing page com programação e perguntas frequentes | 2 | responsiva, sem rolagem lateral no celular | index.html |
| 5 | Formulário de inscrição com máscaras (CPF, telefone, matrícula) | 2 | letras não entram nos campos numéricos | inscricao.html, js/inscricao.js |
| 6 | Validação de CPF (módulo 11) e e-mail | 2/3 | CPF inválido mostra erro | js/core.js |
| 7 | Ingresso com QR Code após a inscrição | 2 | QR aparece e pode ser baixado | js/inscricao.js |
| 8 | Criar tabelas no Base44 (Aluno, Evento, Frequencia, Certificado) | 3 | campos iguais a `base44/*.json` | base44/ |
| 9 | API de inscrição com bloqueio de CPF/e-mail duplicado | 3 | 2º cadastro com o mesmo CPF é recusado | js/api.js |
| 10 | API de frequência (check-in idempotente) | 3 | presença não duplica | js/api.js |
| 11 | Microsserviço proxy (esconder chave do Base44) | 3 | `/health` responde e POST retorna 409 em duplicado | servicos/api-gateway |
| 12 | Login do painel do professor | 2/3 | PIN errado bloqueia após 5 tentativas | js/painel.js |
| 13 | Painel de chamada com caixas de seleção e busca | 2 | marcar presença em 1 clique | painel.html |
| 14 | Leitor de QR Code e check-in por CPF | 2 | ler QR registra presença e dá bipe | js/painel.js |
| 15 | Critério do certificado: check-in em 50% das atividades (3 de 6) | 4 | aluno com 2 check-ins não recebe; com 3 recebe | js/core.js |
| 16 | Gerar PDF no modelo oficial | 4 | nome, horas, curso e código nas posições certas | js/certificado-pdf.js |
| 17 | Código de autenticidade + página de validação | 4 | código falso é recusado | validar.html |
| 18 | Envio do certificado por e-mail (individual e lote) | 4 | aparece na caixa de saída; SMTP real via microsserviço | js/email.js |
| 18b | Lembrete WhatsApp 30 min antes de cada atividade | 4 | só para quem autorizou, sem repetir | servicos/api-gateway/lembretes.js |
| 19 | Exportar inscritos em CSV | 3 | abre no Excel com acentos | js/painel.js |
| 20 | Testes unitários das regras | 5 | `npm test` passando | tests/ |
| 21 | Roteiro de testes de estresse (QA) | 5 | todos os casos de `testes-qa.md` executados | docs/testes-qa.md |
| 22 | Deploy (Netlify/Vercel) | 5 | link HTTPS público funcionando | netlify.toml, vercel.json |
| 23 | Pitch de 5 minutos ensaiado 2 vezes | 5 | cronometrado abaixo de 5:00 | docs/pitch.md |

## Cronograma

| Quando | Entrega |
|---|---|
| Quinta (laboratório) | cartões 1–3 e 8; protótipo das telas no papel/Figma |
| Sexta | cartões 4–7, 9–10 (botão Salvar funcionando) |
| Sábado | cartões 12–16 (1º certificado de teste gerado) |
| Domingo | cartões 11, 17–21; QA em tudo o que está pronto |
| Segunda 16/11, manhã | **Code freeze.** Só correção de bug, cartão 22 (deploy final) e 23 (pitch) |

## Desbloqueio

Se o Front (Squad 2) depender do Banco (Squad 3) que não está pronto, use `backend: "local"` em `js/config.js`:
o site inteiro funciona salvando no navegador, com a mesma API. Quando o Base44 ficar pronto, troque para `"base44"`.

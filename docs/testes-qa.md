# Plano de testes — Squad 5 (QA)

## Automatizados

```bash
npm test
```

21 testes unitários: regras (CPF, máscaras, nome, e-mail, telefone, horas, critério de 50% das atividades, QR Code, código do certificado, escape de XSS) e agendador de WhatsApp (janela de 30 min, só inscritos na atividade, envio único, autorização, telefone inválido, nova tentativa após falha).
Resultado na entrega: **21/21 passando**.

Também foi rodado um teste de ponta a ponta no navegador (Playwright) cobrindo os casos abaixo marcados com ✅.

## Casos de teste manuais ("tente quebrar o sistema")

| # | Cenário | Passos | Resultado esperado | Status |
|---|---|---|---|---|
| 1 | Formulário vazio | Clicar em Confirmar sem preencher | Todos os campos ficam vermelhos com mensagem; nada é salvo | ✅ |
| 2 | Letras no CPF | Digitar `abc529x98224725` | Campo mostra só `529.982.247-25` | ✅ |
| 3 | Números no nome | Digitar `Maria123 da Silva` | Campo mostra `Maria da Silva` | ✅ |
| 4 | CPF com dígito errado | `529.982.247-24` | "CPF inválido" | ✅ (unitário) |
| 5 | CPF repetido | `111.111.111-11` | "CPF inválido" | ✅ (unitário) |
| 6 | Clique duplo no Salvar | Preencher e dar duplo clique | Só **1** inscrição criada | ✅ |
| 7 | CPF já inscrito | Inscrever 2ª pessoa com o mesmo CPF | Bloqueado, campo CPF em vermelho com link para recuperar ingresso | ✅ |
| 8 | E-mail já inscrito | Mesmo e-mail, outro CPF | "Este e-mail já está inscrito" | ✅ (regra na API) |
| 9b | Sem escolher atividade | Preencher tudo e não marcar atividade | Bloqueado: "Escolha pelo menos uma atividade" | ✅ |
| 9 | Sem aceitar LGPD | Desmarcar o termo | Não envia | ✅ |
| 10 | Colar CPF com texto | Colar `CPF: 529.982.247-25` | Máscara extrai os dígitos | ✅ (unitário) |
| 11 | Telefone com +55 | Colar `+55 (86) 99999-8888` | `(86) 99999-8888` | ✅ (unitário) |
| 12 | Script no nome | Digitar `<script>` | Caracteres `<>` são bloqueados | ✅ |
| 13b | Comissão: cadastro e liberação | Criar cadastro em Check-in, tentar entrar, liberar no painel, entrar | Antes de liberar: "ainda não foi liberado". Depois: entra e registra presença com o nome do membro | ✅ |
| 13c | Comissão: bloqueio | Professor bloqueia um membro logado | Na próxima ação o membro é desconectado e a presença não é registrada | ✅ |
| 13 | PIN errado | Digitar `0000` | "PIN incorreto"; 5 erros bloqueiam 60s | ✅ |
| 14 | Check-in por CPF | CPF + Enter | Presença registrada, aparece em "Últimos registros", bipe | ✅ |
| 15 | Check-in repetido | Mesmo CPF 2 vezes | "Já estava presente", sem duplicar horas | ✅ (unitário + API) |
| 16 | CPF não inscrito no check-in | CPF válido que não existe | "CPF não inscrito" + bipe grave | manual |
| 17 | QR Code falso | Ler QR qualquer | "QR Code não pertence à Jornada" | manual |
| 18 | Critério do certificado | Consultar aluno com 2 check-ins e outro com 3 | 2: "Falta(m) 1", sem botão de PDF. 3: certificado liberado | ✅ |
| 19 | Envio em lote | Certificados → Gerar e enviar | Barra de progresso; 2º clique não reenvia | ✅ |
| 20 | PDF | Baixar certificado | Frente: nome, horas, curso, data e código nas posições certas. Verso: todas as atividades do evento com a carga de cada uma e total de 20h, coluna de presença e QR Code | ✅ |
| 21 | Validação | Abrir `validar.html?codigo=` do PDF | "Certificado autêntico" | ✅ |
| 22 | Código falso | `AAAA-BBBB-CCCC` | "Certificado não encontrado" | ✅ |
| 23 | Celular | Abrir em 390 px de largura | Sem rolagem lateral, botões grandes | ✅ |
| 24 | Sem internet | Desligar o Wi-Fi e usar o site local | Funciona (bibliotecas em `vendor/`) | manual |
| 25 | Lembrete WhatsApp | `node lembretes.js --uma-vez --agora 2026-12-09T07:31:00-03:00` | Mensagem só para quem se inscreveu na atividade e autorizou; rodar de novo não repete | ✅ |

## Antes do pitch (checklist)

- [ ] `npm test` passando
- [ ] Link público HTTPS abrindo no celular
- [ ] Painel → Dados → **Apagar todos os dados**, depois **Popular dados de demonstração**
- [ ] Câmera liberada no navegador do notebook da apresentação
- [ ] Um ingresso com QR Code salvo no celular para o check-in ao vivo
- [ ] Plano B: vídeo de 1 minuto do fluxo gravado, caso a internet caia

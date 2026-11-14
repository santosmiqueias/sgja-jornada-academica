# Roteiro do pitch — 5 minutos (Squad 5)

Duas pessoas: **Apresentador** (fala) e **Operador** (mexe no sistema). Ensaiem com cronômetro.

## 0:00 – 0:40 · A dor

> "Prof. Edson, hoje a Jornada roda com Google Forms, lista de papel e certificado feito um por um.
> Resultado: inscrição duplicada, CPF digitado errado, lista extraviada e semanas para entregar certificado.
> Nós construímos o **S.G.J.A**: um sistema só, do primeiro clique ao certificado na caixa de entrada."

## 0:40 – 1:40 · Submissão do trabalho (Operador)

1. Página inicial: tema, edital para baixar, programação e cronograma oficiais.
2. **Submissão**: escolher APIExt II e mostrar o formato travado em comunicação oral; resumo com contador; anexar o PDF; adicionar um participante.
3. Enviar → protocolo e ingresso com QR Code.

> "Um envio por trabalho, com todos os participantes, arquivo conferido e regras do edital aplicadas automaticamente."

## 1:40 – 2:50 · Check-in em segundos

0. **Organização** (link no topo): a banca abre o trabalho, baixa o arquivo, aprova e marca a sessão. O participante já vê o resultado em Meu certificado.
1. Página **Check-in** do menu: o membro da comissão entra com o próprio e-mail e senha (o professor liberou o acesso no painel).
2. Ler o QR do celular com a câmera → bipe, "Presença confirmada", contador sobe.
3. Mostrar o check-in por CPF (modo totem) e a lista com caixas de seleção.

> "Três formas de chamada, em tempo real, sem papel. Presença não duplica."

## 2:50 – 4:00 · Certificado automático

1. Aba **Certificados**: "quem participou de pelo menos 1 dia do evento recebe o certificado de 20 horas; o verso traz toda a programação, para o Currículo Lattes".
2. **Gerar e enviar para todos os aptos** → barra de progresso, caixa de saída.
3. Abrir o PDF: modelo oficial, nome, horas cumpridas, código e QR de autenticidade.
4. Escanear o QR do PDF → **Certificado autêntico**.

> "O que levava semanas agora leva um clique, e ninguém consegue falsificar."

## 4:00 – 4:40 · Engenharia por trás

- HTML5, CSS3, JavaScript, Bootstrap; servidor Node com login por perfil; banco no **Base44** (chave só no servidor).
- Auditoria de segurança: atacamos o próprio sistema, corrigimos 9 falhas e 17 testes repetem os ataques a cada mudança.
- Segurança: validação de CPF pelo algoritmo oficial, PIN com hash, QR assinado, LGPD com CPF mascarado.
- Qualidade: testes automatizados e 24 casos de teste de estresse.
- No ar em HTTPS: *(mostrar o link)*.

## 4:40 – 5:00 · Fechamento

> "O S.G.J.A elimina o retrabalho, protege os dados e entrega o certificado no mesmo dia.
> Está pronto para rodar na 6ª Jornada em dezembro. Obrigado!"

## Perguntas prováveis da banca

- **"E se a internet cair?"** O site roda localmente; as bibliotecas estão embutidas. O check-in por CPF funciona como totem.
- **"E se alguém tentar invadir?"** Senhas com hash, sessões assinadas, bloqueio após 5 erros, cada perfil só vê o necessário. Está tudo em `docs/seguranca.md`, com os testes de ataque.
- **"Como impede fraude de presença?"** O QR é assinado com SHA-256 e só o professor autenticado registra presença.
- **"E a LGPD?"** Consentimento obrigatório, CPF mascarado nas telas e no PDF, dados usados só para a finalidade informada.
- **"Qual o critério do certificado?"** Participar de pelo menos 1 dia do evento. O certificado é de 20 horas (carga total). Está em `js/config.js` (`diasMinimosCertificado`).

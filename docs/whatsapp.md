# Lembrete por WhatsApp — 30 minutos antes de cada atividade

## Como funciona

1. Na inscrição, o aluno escolhe **em quais atividades vai se inscrever** (campo `atividades`) e marca
   **"Quero receber no WhatsApp um lembrete..."** (campo `aceitaWhatsApp`).
2. O servidor `servicos/api-gateway` verifica **a cada minuto** quais atividades começam nos próximos 30 minutos.
3. O lembrete de cada atividade vai **só para quem se inscreveu nela** e autorizou WhatsApp. Envia a mensagem uma única vez por atividade e grava em `dados/lembretes-enviados.json`
   (ou na tabela `LembreteWhatsApp` no Base44). Reiniciar o servidor não causa mensagem repetida.
4. Se o servidor ficar fora do ar no minuto exato, ele ainda envia ao voltar, desde que a atividade não tenha começado.
5. Se o provedor falhar, tenta de novo no minuto seguinte, até 3 vezes. Telefone inválido é registrado e ignorado.

Exemplo de mensagem:

```
Olá, Maria! ⏰ Faltam 30 minutos para "Abertura e Palestra Magna" na 6ª Jornada Acadêmica.
🕗 Início: 08:00
📍 Local: Auditório Principal
Leve o QR Code do seu ingresso para o check-in. Até já!
```

Horários e antecedência vêm de `js/config.js` (`eventos`, `evento.fusoHorario` e `whatsapp.antecedenciaMinutos`). O site e o servidor usam o mesmo arquivo.

## Rodar

```bash
cd servicos/api-gateway
npm install
cp .env.example .env
npm start
```

O agendador sobe junto com o servidor. Para testar sem esperar o dia do evento, simule o horário:

```bash
node lembretes.js --uma-vez --agora 2026-12-09T07:31:00-03:00
```

Ver a agenda (também aparece no painel, aba **Lembretes**):

```bash
node lembretes.js --agenda
```

## De onde vêm os inscritos

O servidor usa o próprio armazenamento: a tabela `Aluno` do Base44 (se configurado) ou o arquivo `dados/Aluno.json`.
Nenhuma lista com telefones é exportada do site.

## Escolher o provedor (`WHATSAPP_PROVEDOR` no `.env`)

### `simulado` (padrão)
Não envia nada. Mostra as mensagens no terminal. Ideal para o pitch.

### `twilio` — mais rápido para testar com celular de verdade
1. Crie conta gratuita em twilio.com → Messaging → **Try WhatsApp** (sandbox).
2. Cada celular de teste manda a mensagem `join <palavra-código>` para o número do sandbox.
3. Preencha `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` e `TWILIO_WHATSAPP_FROM=+14155238886`.

No sandbox, só recebe quem fez o `join`. Para todos os alunos, é preciso um número aprovado (pago).

### `meta` — WhatsApp Cloud API oficial (produção)
1. developers.facebook.com → criar app do tipo **Business** → adicionar o produto **WhatsApp**.
2. Copie o **Phone number ID** e gere um **token permanente** (usuário do sistema no Business Manager).
3. Em **Modelos de mensagem**, crie o modelo `lembrete_atividade`, categoria **Utilidade**, idioma **Português (BR)**:

   ```
   Olá, {{1}}! Faltam {{2}} minutos para "{{3}}" na 6ª Jornada Acadêmica.
   Início: {{4}}
   Local: {{5}}
   Leve o QR Code do seu ingresso para o check-in.
   ```

4. Aguarde a aprovação (normalmente minutos ou poucas horas) e preencha `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.

A Meta só permite iniciar conversa com **modelo aprovado** e com **autorização (opt-in)** do destinatário. Por isso o formulário tem a caixa de autorização.

## Hospedagem

O servidor precisa ficar ligado nos dias 09 e 10/12 (Netlify/Vercel hospedam só o site, não o agendador).
Opções: Render, Railway ou Fly.io (plano gratuito serve), ou um computador da faculdade com `npm start`.
Alternativa sem servidor sempre ligado: agendar `node lembretes.js --uma-vez` a cada minuto no cron do Linux ou em uma GitHub Action.

## LGPD

- Só recebe quem marcou a autorização (opt-in), separada do termo obrigatório.
- O telefone é usado só para o lembrete da Jornada.
- Os tokens ficam no `.env` do servidor, nunca no site.

# Login com Google no check-in

Membros da comissão podem entrar no check-in com a conta Google, sem criar senha.

- **Já tem cadastro:** o botão "Fazer login com o Google" entra direto. O servidor reconhece a pessoa pelo e-mail
  verificado da conta Google e liga a conta ao cadastro na primeira vez (a senha antiga continua valendo).
- **Não tem cadastro:** o Google preenche nome e e-mail; a pessoa informa só CPF e telefone. O cadastro fica
  **pendente** até um professor liberar no painel, como no cadastro com senha.
- **Segurança:** o navegador só repassa o "ID token" do Google. O servidor (`servicos/api-gateway/google.js`) confere
  a assinatura com as chaves públicas do Google, o emissor, o destinatário (nosso ID do cliente), a validade e se o
  e-mail é verificado. Um token de outro app, vencido, adulterado ou com e-mail não verificado é recusado (401).
- Só funciona no modo `servidor`. Na demonstração (`local`) o botão não aparece.

## Ativar (uma vez)

1. Acesse https://console.cloud.google.com e crie um projeto (ex.: "SGJA Jornada").
2. Em **APIs e serviços → Tela de permissão OAuth** (ou "Google Auth Platform → Branding"):
   tipo **Externo**, nome do app "VI Jornada Acadêmica", e-mail de suporte, e publique o app (**Publicar app**).
   Só são usados os escopos básicos (nome e e-mail), que não precisam de verificação do Google.
3. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - **Origens JavaScript autorizadas:** `https://santosmiqueias.github.io`
   - (Não precisa de "URIs de redirecionamento".)
4. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`). Não é segredo.
5. Coloque o ID em dois lugares:
   - `js/config.js` → `google: { clientId: "SEU-ID.apps.googleusercontent.com" }` (rode `npm run versao` e publique);
   - no Render → **Environment** → `GOOGLE_CLIENT_ID` = o mesmo ID → **Save, rebuild, and deploy**.

Para desligar, apague o ID dos dois lugares.

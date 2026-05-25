## 1. Corrigir link do e-mail de boas-vindas

Arquivo: `supabase/functions/send-welcome-email/index.ts`

- Linha 121 (versão texto): trocar `https://dachser.z3us.ai/change_password.php` por `https://dachser.z3us.ai/`.
- O HTML já usa `accessUrl = "https://dachser.z3us.ai/"` (linhas 18 e 97), então nada a alterar lá.

Após editar, fazer deploy da Edge Function `send-welcome-email`.

## 2. Restringir rotas a usuários admin

Rotas afetadas (em `src/App.tsx`):
- `/air/tracking-aereo` → `<TrackingAereo />`
- `/air/cct` → `<CCTDashboard />`
- `/sea/tracking` → `<ContainerTracking />`

### Abordagem

Criar um componente `src/components/AdminOnlyRoute.tsx` que:
- Lê `localStorage["user"]` (mesmo padrão usado em `useAuth` / `useDevAccess` / `adminAccess.ts`).
- Considera admin quando `is_admin === 1` (ou `"1"`/`true`).
- Se não for admin, redireciona via `<Navigate to="/dashboard" replace />` e dispara um `toast` informando "Acesso restrito a administradores".
- Se admin, renderiza `children`.

Envolver as 3 rotas em `App.tsx`:

```tsx
<Route path="/sea/tracking" element={<AdminOnlyRoute><ContainerTracking /></AdminOnlyRoute>} />
<Route path="/air/cct" element={<AdminOnlyRoute><CCTDashboard /></AdminOnlyRoute>} />
<Route path="/air/tracking-aereo" element={<AdminOnlyRoute><TrackingAereo /></AdminOnlyRoute>} />
```

Observações:
- Escopo restrito às 3 rotas pedidas — sub-rotas (`/sea/tracking/manual`, `/sea/tracking/notificacoes`, `/air/cct/excecoes`, etc.) **não** serão alteradas, pois o pedido foi específico a essas três telas.
- Não esconder itens do menu nesta task — apenas bloquear acesso. Posso adicionar isso depois se quiser.

## Pontos a confirmar

- (a) Sub-rotas devem ser restritas também? (ex.: `/air/cct/excecoes`, `/sea/tracking/notificacoes`)
- (b) Esconder os itens correspondentes do menu lateral para não-admins, ou só bloquear a rota?

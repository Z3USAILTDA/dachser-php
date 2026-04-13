

## Plano: Restringir acesso à tela Robô e aba Pagamento por role

### Objetivo
Usuários sem função (role) definida não poderão acessar:
1. A página `/fin/esteira/robot` (ComprovanteRobot)
2. A aba "Pagamento" nos detalhes do voucher

### Alterações

**1. `src/pages/esteira/ComprovanteRobot.tsx`**
- Importar `useUserRole` e verificar `hasEsteiraAccess`
- Se o usuário não tiver role/acesso, exibir mensagem de acesso negado e redirecionar

**2. `src/pages/esteira/EsteiraVoucherDetails.tsx`**
- Importar flags de role (já usa `useUserRole`)
- Condicionar a renderização da `TabsTrigger` "Pagamento" (linhas 308-313) e do `TabsContent` "pagamento" (linhas 410-438) para que só apareçam se o usuário tiver uma role válida (`hasEsteiraAccess` ou roles específicas como FINANCEIRO, ADMIN, SUPERVISOR)

### Resultado
- Usuários sem função verão os detalhes e histórico do voucher, mas não a aba de Pagamento
- A rota `/fin/esteira/robot` redirecionará usuários sem função para a esteira principal


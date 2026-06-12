## Problema

O componente `EmailClienteRegrasDialog` existe em `src/components/air/`, mas nunca foi montado em `src/pages/air/TrackingAereo.tsx` — por isso o botão não aparece em `/air/tracking-aereo`.

## Mudança

Em `src/pages/air/TrackingAereo.tsx`:

1. Importar `EmailClienteRegrasDialog` e o ícone `BellRing` (lucide-react).
2. Adicionar estado `regrasOpen`.
3. Inserir um botão-ícone no header (mesma linha do avião/ajuda/@admin), com:
   - `title="Regras de Notificação por Cliente"`
   - Mesmo estilo dos demais ícones do header (botão circular discreto).
   - `onClick` → `setRegrasOpen(true)`.
4. Renderizar `<EmailClienteRegrasDialog open={regrasOpen} onOpenChange={setRegrasOpen} />` ao final do JSX.

Nenhuma outra tela ou lógica é alterada. Mudança é apenas de UI/wiring.

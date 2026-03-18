

## Diagnóstico: Movimentação Global — Tela Preta

### Causa raiz: MariaDB offline

A página Movimentação Global **não tem bug de código**. O problema é que o servidor MariaDB em **177.70.19.42:3306 está completamente inacessível** desde as edge functions.

Todos os logs das últimas horas mostram consistentemente:
- `EHOSTUNREACH` (No route to host — os error 113)
- `ECONNREFUSED` (Connection refused)

### O que acontece na prática

1. A página carrega normalmente (background, header, KPIs, legenda)
2. O token Mapbox é obtido com sucesso -- o mapa renderiza
3. Mas o mapa usa tema **dark-v11** (fundo escuro/preto)
4. Sem dados do MariaDB, não há marcadores, rotas, nem KPIs preenchidos
5. Resultado visual: **mapa preto vazio** = "tela preta"

### Solução

Não há correção de código necessária. O MariaDB precisa voltar a ficar acessível. Possíveis causas:
- O servidor MariaDB (177.70.19.42) está desligado ou reiniciando
- Firewall bloqueando conexões externas na porta 3306
- Problema de rede/roteamento entre o datacenter do Supabase (eu-central-1) e o IP do MariaDB

### Melhoria sugerida (opcional)

Adicionar um indicador visual na página quando o banco está inacessível, em vez de mostrar apenas o mapa vazio. Um banner como "Sem conexão com o banco de dados — dados indisponíveis" ajudaria o usuário a entender o problema.

### Ação imediata

Verifique se o servidor MariaDB em **177.70.19.42** está operacional e aceitando conexões na porta 3306.


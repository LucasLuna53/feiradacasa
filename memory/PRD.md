# Feira da Casa — PRD

## Visão
App mobile Expo (React Native) que evolui o app web atual "Feira da Casa" em um produto profissional de gestão de despensa, lista de compras inteligente, leitura de cupom fiscal por IA, sugestão de receitas e preços comunitários anônimos.

## Stack
- Backend: FastAPI + MongoDB (motor) + JWT + bcrypt + emergentintegrations (GPT-4o)
- Frontend: Expo Router, AsyncStorage, axios, lucide-react-native, expo-image-picker
- LLM: OpenAI GPT-4o via Emergent Universal Key

## Features (MVP entregue)
1. **Autenticação** — Registro/Login por e-mail+senha (JWT em Bearer + cookie). Admin seedado.
2. **Estoque sem duplicação por marca** — Produtos genéricos (ex: "Leite UHT 1L"). 10 produtos brasileiros seedados ao registrar.
3. **Lista inteligente** — Itens automáticos quando `current_qty < min_qty`, com último preço, data e mercado; itens manuais; checkbox; limpar marcados.
4. **Cupom Fiscal por IA** — Upload câmera/galeria → GPT-4o extrai `{market, date, items[name, qty, unit_price, total, brand]}` → usuário confirma → estoque + histórico de preços + comunidade atualizados.
5. **Histórico de preços** — Backend agrega `last/min/max/avg` por produto.
6. **Receitas IA** — GPT-4o sugere 3-5 receitas brasileiras a partir da despensa atual (`/api/recipes/suggest`), mostra ingredientes faltantes com botão "adicionar à lista".
7. **Comunidade anônima** — POST/GET `/api/community/prices` com summaries (menor/média/maior) + feed recente. Sem identidade exposta.
8. **Compartilhamento Familiar** — `/api/family/invite` gera código; `/api/family/join` migra estoque para grupo compartilhado; multi-membro acessa mesma despensa.

## Arquitetura
- Coleções: users, products, shopping_list, price_history, receipts, community_prices, family_invites
- Group-aware: cada produto pertence a `group_id` (próprio user ou família).
- Rotas: `/api/auth/*`, `/api/products`, `/api/shopping-list`, `/api/receipts/*`, `/api/recipes/suggest`, `/api/community/prices`, `/api/family/*`.

## Telas (5 tabs)
Lista · Estoque · Receitas · Comunidade · Perfil

## Diferencial de negócio
Comunidade anônima de preços vira **rede de inteligência de preços local** — quanto mais usuários escaneiam cupom, melhor a recomendação de "menor preço perto de você", criando network effect e baixando CAC via valor compartilhado.

## Próximos passos
- Modo offline com fila local (AsyncStorage) e sincronização ao voltar online
- Tela de detalhe de produto com gráfico histórico
- Notificações push para "preço caiu na sua região"
- Login com Google (Emergent Auth)

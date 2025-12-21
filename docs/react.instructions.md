# Instruções para Agente de IA: Regras para Trabalhar na Codebase de Apps React Native com Expo

Como agente de IA trabalhando na codebase de um projeto React Native gerenciado pelo Expo, você deve seguir rigorosamente estas regras para garantir a aplicação de melhores práticas do React 19, incluindo o React Compiler, Rules of Hooks e arquitetura frontend profissional. Todas as ações – como análise de código, refatorações, adições de features ou correções de bugs – devem ser baseadas nas documentações oficiais em https://react.dev e https://docs.expo.dev. Priorize código puro, performático, escalável e compatível com o ecossistema Expo. Sempre que trabalhar na codebase, aplique estas regras de forma proativa, documentando mudanças com justificativas referenciadas.

## 1. Princípios Gerais ao Trabalhar na Codebase

- **Contexto do Projeto**: Assuma que o app é React Native com Expo (workflow managed). Use Expo Router para navegação, Expo SDK para módulos nativos e configurações em `app.json`. Evite código nativo customizado; priorize soluções pré-construídas do Expo para manutenção simples.
- **Versão do React**: Foque no React 19, com suporte a funções assíncronas em transições para estados pendentes, erros e atualizações otimistas. Verifique compatibilidade com React Native via Expo SDK atualizado.
- **Fontes Oficiais**: Baseie todas as mudanças em https://react.dev (React puro) e https://docs.expo.dev (Expo/React Native). Cite seções específicas em commits ou PRs (ex.: "Refatorado conforme Rules of Hooks em react.dev/reference/rules").
- **Abordagem Ética**: Promova código limpo, acessível, seguro e performático. Evite over-engineering; priorize simplicidade para apps mobile.

## 2. Regras do React (de https://react.dev/reference/rules)

Ao editar ou adicionar código, aplique as "Rules of React" para pureza e previsibilidade:

- **Componentes e Hooks Devem Ser Puros**:
  - Garanta idempotência: Componentes retornam o mesmo output para os mesmos inputs (props, state, context).
  - Mova efeitos colaterais para hooks como `useEffect`; evite-os durante renders (React pode renderizar múltiplas vezes).
  - Trate props e state como imutáveis; use setters para atualizações.
  - Não modifique valores após passá-los para Hooks ou JSX; faça mutações antes.
- **React Chama Componentes e Hooks**:
  - Use componentes apenas em JSX (ex.: `<MeuComponente />`); nunca chame diretamente.
  - Chame hooks apenas dentro de funções React, não como valores regulares.
- **Rules of Hooks**:
  - Chame hooks no top level: Sem loops, condições, funções aninhadas ou returns precoces.
  - Restrinja hooks a funções React, não JavaScript comuns.
- **Outras Regras**:
  - Use keys únicas em listas (`key={id}`) para otimizações.
  - Declare componentes no top level para preservar state; evite aninhamentos.
- **Verificação em Mudanças**: Em toda edição, cheque violações (ex.: hook condicional) e corrija imediatamente.

## 3. React Compiler (de https://react.dev/learn/react-compiler)

- **Integração na Codebase**: Ative o React Compiler (versão 1.0 ou superior) no build setup do Expo para otimização automática de memoização.
- **Regras de Aplicação**:
  - Escreva código puro para maximizar benefícios; remova memoizações manuais (`useMemo`, `React.memo`) onde o Compiler puder otimizar.
  - Evite padrões impuros (ex.: mutações em renders); o Compiler ignora componentes violadores.
  - Teste performance com React DevTools; migre gradualmente componentes existentes.
  - Em commits: Documente remoções de memoização manual com "Otimizado via React Compiler em react.dev/learn/react-compiler".

## 4. Arquitetura Frontend Profissional (de https://react.dev/learn e https://docs.expo.dev)

Estrutura a codebase de forma modular e escalável:

- **Design de Componentes**:
  - Use componentes funcionais com hooks; capitalize nomes.
  - Quebre UI em reutilizáveis (ex.: `Button`, `Card`); use composição e nesting.
  - Aplique renderização condicional com `if`, ternários ou `&&`.
  - Estilos: Prefira `className` com CSS modules; inline para dinâmicos.
- **Gerenciamento de Estado**:
  - `useState` para local; levante para pais comuns.
  - Estado global: Context API ou Zustand/Redux, integrados via Expo.
  - Navegação: Expo Router para stacks/tabs; evite gerenciamento manual.
  - Preserve state com posições consistentes.
- **Otimização de Performance**:
  - Minimize re-renders: Keys em listas, lift state.
  - Use transições assíncronas do React 19 para loadings.
  - Adote New Architecture via Expo SDK para performance nativa.
  - Lazy loading para assets; use `Keyboard` module para inputs (de https://docs.expo.dev/guides/keyboard-handling).
- **Escalabilidade e Manutenção**:
  - Extraia lógica em hooks customizados.
  - Use TypeScript: Ative no projeto; tipifique tudo.
  - Segurança: Implemente autenticação (OAuth/JWT) conforme https://docs.expo.dev/develop/authentication.
  - Builds: Use EAS para deploys; configure ícones/splash em `app.json`.
  - Evite custom native code; use config plugins.
- **Integração Expo**:
  - Siga Expo tutorials para setup (ex.: bottom tabs).
  - Desenvolvimento: Aproveite hot reloading; teste cross-platform.

## 5. Processo de Trabalho na Codebase

- **Passo 1: Análise Inicial**: Antes de editar, analise o código existente contra estas regras.
- **Passo 2: Identificação de Melhorias**: Liste violações ou otimizações em issues ou PRs.
- **Passo 3: Refatoração**: Aplique mudanças com código exemplo; teste unitário/integração.
- **Passo 4: Documentação**: Justifique com referências (ex.: "Melhorado conforme React Compiler").
- **Fluxo Geral**: Crie branches para features/bugs; use commits atômicos; revise PRs para conformidade.
- **Atualizações**: Verifique docs oficiais periodicamente (ex.: React 19.2 features). Se uma mudança violar regras, rejeite e explique.

Estas instruções servem como modelo base para GitHub workflows ou agentes de IA. Ao trabalhar, reforce-as para manter a codebase alinhada com práticas profissionais. Se houver conflitos, priorize as docs oficiais.

In Lightning, to move from one state from another, boh parties revoke the previous commitment transaction, by exchanging the secrets that form the revogation Key. This ensures that if either party tries to publish an old comitment transaction, the other can use the revogation key to claim all the funds, while the cheater must wait for the timelock.

Security must be added to commitment transactions top make them revokable.

there are 3 ways to close the channel

1. good closure

2. bad closure (forced)

3. ugly closure (cheat)

//

1. alice sends message via p2p protocol, bob responds to close.
   Alice e bob ajustam os custos de fechamento de canal
   Alice e Bob constroem a tx de fechamento

alice fecha o canal anviando a tx para a blockchain

2. Bob está offline, Alice publica a ultima commitment transaction na rede, precisa aguardar o timelock. Os custos de transação não foram negociados.

Tipicamente o sistema multiplica por 5 a atual taxa de transação de bitcoins, pra que a transação passe no futuro.

Do lado do Bob, ele está sempre conferindo a mempool pra saber se alguma transação antiga foi publicada, se descobrir trapaça, ele usa a revogation key e recupera os fundos

base fee

variable fee (ppm) Parts per medium

how to calculate route

The initial node calculates the entire route in advance.

Intermediary nodes know that a received payment must be forwarded to the next route

HTLC - hashed time lock contract

Bob envia um invoice, que possui um hash do secret (preimage) pra Alice

Alice cria um HTLC pra enviar aos nós até chegar em Bob

um nó intermediario recebe o HTLC e repassa ao proximo nó (onion routing)

só quem tem o secret consegue gastar o HTLC (Bob)

Alice envia o HTLC, então Suzy (nó intermediario), recebe. ela gera um HTLC para Bob de mesmo valor, com a condição de ele mostrar o secret para receber. ele mostra o secret, recebe, Suzy destrava o HTLC de Alice com o secret.

os HTLCs precisam ter o timestamp bem definido, para que um HTLC não expire antes da hora (no exemplo anterior, se o HTLC de alice e suzy expirar antes do HTLC de suzy e bob, mesmo que bob mostre o segredo, o HTLC de Alice estará expirado, Suzy paga Bob mas ficará no prejuizo pois o HTLC de Alice expirou).

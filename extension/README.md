# Extensão Tove (Chrome / Edge / Brave)

Extensão para navegadores baseados no Chromium que conecta diretamente ao aplicativo desktop **Tove**. Ela permite visualizar canais, mensagens e links em tempo real, além de enviar a URL da aba ativa diretamente para o canal selecionado com apenas um clique.

## Como Instalar no Navegador:

1. Abra o aplicativo **Tove** no computador (o servidor de sincronização já inicia automaticamente na porta `54321`).
2. No seu navegador (Chrome, Edge, Brave, Opera, etc.), acesse `chrome://extensions` (ou `edge://extensions`).
3. Ative a chave **Modo do desenvolvedor** no canto superior direito.
4. Clique no botão **Carregar sem compactação** (*Load unpacked*).
5. Selecione esta pasta `extension`.

## Recursos:
- **Detecção Automática:** Conecta automaticamente via loopback em `http://127.0.0.1:54321` sem necessidade de login ou token quando executada no mesmo PC.
- **Conexão Remota / QR:** Caso queira parear com outro computador ou dispositivo na rede, clique no botão **QR** e cole o JSON de pareamento gerado no Tove.
- **Envio Rápido:** Selecione o canal desejado e clique em **Enviar link** para transmitir a aba ativa (com miniatura/título automáticos) diretamente para a sua timeline no Tove.

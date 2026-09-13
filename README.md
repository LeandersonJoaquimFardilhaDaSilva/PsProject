# Flow Desktop

Aplicativo desktop nativo desenvolvido com **Electron**, **React**, **TypeScript**, **Tailwind CSS** e **Vite**.

Organize seus links, textos e imagens em canais com armazenamento local, visualização rápida e barra de título integrada.

---

## 🚀 Como Executar

### 1. Modo Desenvolvimento Desktop (com Hot-Reload)
Inicia o Vite e o Electron simultaneamente:
```bash
npm run electron:dev
```

### 2. Modo Preview Desktop
Compila o frontend e abre a janela do Electron carregando a versão de produção:
```bash
npm run electron:preview
```

### 3. Modo Web (apenas navegador)
```bash
npm run dev
```

---

## 📦 Como Gerar o Executável (.exe para Windows)

Para gerar o instalador (NSIS) e a versão portátil (`.exe`) do Flow para Windows:
```bash
npm run electron:build
```
Os arquivos gerados ficarão disponíveis na pasta `dist-electron/`.

---

## 🛠️ Tecnologias
- **Electron 44**
- **React 18**
- **TypeScript 5**
- **Vite 5**
- **Tailwind CSS 3**
- **Lucide Icons**
- **Electron Builder**


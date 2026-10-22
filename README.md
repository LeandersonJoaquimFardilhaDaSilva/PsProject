# Tove (Transfer, Organize, Visualize, Everywhere)

Aplicativo multiplataforma (Desktop e Mobile) desenvolvido com **Electron**, **Capacitor**, **React**, **TypeScript**, **Tailwind CSS** e **Vite**.

Transfira, organize e visualize seus links, notas, fotos, vídeos e arquivos em canais com sincronização local P2P e alta performance.

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

Para gerar o instalador (NSIS) e a versão portátil (`.exe`) do Tove para Windows:
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


#!/bin/bash
# Script para gerar version.json antes do deploy
# Executado automaticamente via "predeploy" no package.json

node -e '
const { execSync } = require("child_process");
const fs = require("fs");

let hash = "local";
let date = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
let buildAt = new Date().toISOString();
let history = [];

try {
  hash = execSync("git rev-parse --short HEAD 2>/dev/null").toString().trim() || "local";
  date = execSync("git log -1 --format=\"%cd\" --date=format:\"%d/%m/%Y %H:%M\" 2>/dev/null").toString().trim() || date;
  
  // Pegar últimos 20 commits
  const rawLog = execSync("git log -n 20 --format=\"%h\t%cd\t%an\t%s\" --date=format:\"%d/%m/%Y %H:%M\" 2>/dev/null").toString().trim();
  if (rawLog) {
    history = rawLog.split("\n").filter(Boolean).map(line => {
      const parts = line.split("\t");
      const commitHash = parts[0] || "";
      const commitDate = parts[1] || "";
      const author = parts[2] || "";
      const subject = parts.slice(3).join("\t") || "";
      return { hash: commitHash, date: commitDate, author, subject };
    });
  }
} catch (e) {
  console.warn("Aviso ao extrair histórico git:", e.message);
}

const data = {
  hash,
  date,
  buildAt,
  history
};

fs.writeFileSync("version.json", JSON.stringify(data, null, 2));
console.log(`✅ version.json gerado com ${history.length} atualizações: v${hash} · ${date}`);
'

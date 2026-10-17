// Gera os ícones PNG do app (sem dependências): quadrado escuro com um ponto rosé.
// Uso: node tools/gerar_icones.mjs  → escreve em icons/
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const FUNDO = [0x1c, 0x19, 0x17], PONTO = [0xd8, 0xa7, 0xb4];

const crcTab = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(tipo, dados) {
  const t = Buffer.from(tipo), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, c]);
}
function png(tam, pixel) {
  const linhas = Buffer.alloc((tam * 4 + 1) * tam);
  for (let y = 0; y < tam; y++) {
    linhas[y * (tam * 4 + 1)] = 0;
    for (let x = 0; x < tam; x++) {
      const [r, g, b, a] = pixel(x + .5, y + .5, tam);
      const o = y * (tam * 4 + 1) + 1 + x * 4;
      linhas[o] = r; linhas[o + 1] = g; linhas[o + 2] = b; linhas[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(linhas, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// cobertura suave (antialias de 1px) para bordas
const suave = d => Math.max(0, Math.min(1, .5 - d));
const mistura = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));

// raio do canto (0 = quadrado inteiro, para o ícone "maskable")
function icone(raioCanto, raioPonto) {
  return (x, y, s) => {
    const r = raioCanto * s, cx = Math.min(Math.max(x, r), s - r), cy = Math.min(Math.max(y, r), s - r);
    const dCanto = r ? Math.hypot(x - cx, y - cy) - r : -1;
    const alfa = r ? suave(dCanto) : 1;
    const dPonto = Math.hypot(x - s / 2, y - s / 2) - raioPonto * s;
    const cor = mistura(FUNDO, PONTO, suave(dPonto));
    return [...cor, Math.round(alfa * 255)];
  };
}
mkdirSync('icons', { recursive: true });
for (const t of [192, 512]) writeFileSync(`icons/icon-${t}.png`, png(t, icone(.22, .14)));
writeFileSync('icons/maskable-512.png', png(512, icone(0, .11)));
writeFileSync('icons/apple-touch-icon.png', png(180, icone(0, .14)));
console.log('ícones gerados em icons/');

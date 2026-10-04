// Собирает в dist/ только публичный фронтенд (для Cloudflare Pages и любого статического хостинга).
// Исходники и данные сервера (server/: банки вопросов с ключами, закрытые картинки) сюда не попадают.
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";

const OUT = "dist";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

for (const f of readdirSync(".")) {
  if (/\.(html|js|css)$/.test(f) || ["favicon.ico", "robots.txt", "sitemap.xml"].includes(f)) {
    if (f === "build-pages.mjs") continue;
    cpSync(f, `${OUT}/${f}`);
  }
}
if (existsSync("assets")) cpSync("assets", `${OUT}/assets`, { recursive: true });
console.log("dist готов:", readdirSync(OUT).join(", "));

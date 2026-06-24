import fs from "node:fs";
import path from "node:path";
import type { EgoStore } from "./store.ts";

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/**
 * Render a single self-contained HTML report of the browser session: every
 * screenshot embedded as a base64 data URI alongside its URL/title/time and the
 * task-space timeline. Shareable with no external files. Returns the path.
 */
export function exportHtml(store: EgoStore): string {
	const shots = store.shots;
	const cards = shots
		.map((s) => {
			let dataUri = "";
			try {
				dataUri = `data:image/png;base64,${fs.readFileSync(s.file).toString("base64")}`;
			} catch {
				/* skip unreadable shot */
			}
			const when = new Date(s.ts).toLocaleString();
			const link = s.url ? `<a href="${esc(s.url)}">${esc(s.url)}</a>` : "<span class=dim>no url</span>";
			return `<figure>
  ${dataUri ? `<a href="${dataUri}" target=_blank><img src="${dataUri}" loading=lazy></a>` : "<div class=missing>image missing</div>"}
  <figcaption>
    <div class=t>${esc(s.title || `Shot #${s.id}`)}</div>
    <div class=u>${link}</div>
    <div class=dim>#${s.id} • ${esc(when)}${s.taskSpace ? ` • space:${esc(s.taskSpace)}` : ""}</div>
  </figcaption>
</figure>`;
		})
		.join("\n");

	const spaceRows = store
		.spaceSummary()
		.map(
			(s) =>
				`<tr><td>${s.open ? "🟢" : "⚪"}</td><td>${esc(s.name)}</td><td>${s.events}</td><td class=dim>${esc(s.lastUrl || "-")}</td></tr>`,
		)
		.join("\n");

	const html = `<!doctype html>
<html><head><meta charset=utf-8><title>ego session ${esc(store["dir"].split("/").pop() || "")}</title>
<style>
:root{color-scheme:light dark}
body{font:14px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:2rem;max-width:1100px;margin:auto}
h1{font-size:1.3rem} .dim{color:#888;font-size:.85em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.2rem;margin-top:1.5rem}
figure{margin:0;border:1px solid #8883;border-radius:10px;overflow:hidden;background:#80808014}
img{width:100%;display:block;background:#0001}
figcaption{padding:.6rem .8rem}
.t{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.u{font-size:.85em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
a{color:#3b82f6;text-decoration:none} a:hover{text-decoration:underline}
.missing,.empty{padding:3rem;text-align:center;color:#888}
table{border-collapse:collapse;margin-top:1rem;width:100%} td{padding:.3rem .6rem;border-bottom:1px solid #8882}
</style></head><body>
<h1>📸 ego browser session</h1>
<div class=dim>${shots.length} screenshots • ${store.spaceSummary().length} task spaces • ${store.navs.length} navigations</div>
${spaceRows ? `<h2 style="font-size:1rem">Task spaces</h2><table><thead><tr><th></th><th>name</th><th>events</th><th>last url</th></tr></thead><tbody>${spaceRows}</tbody></table>` : ""}
${shots.length ? `<div class=grid>${cards}</div>` : "<div class=empty>No screenshots captured.</div>"}
</body></html>`;

	const out = path.join(store.dir, "report.html");
	fs.writeFileSync(out, html);
	return out;
}

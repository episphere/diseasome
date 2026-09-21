// Closable help text box for the "?" column badges used across all tables.
//
// A single delegated listener serves every table (Genomic Data, Risk Models,
// Results, participants, variant tables), including ones re-rendered later:
// clicking a `.col-help` badge opens a small text box anchored under it, titled
// with the column name and pointing at the badge with a small arrow. The same
// box also serves `.cell-more` truncated body cells, showing the full value.
// The box closes via its × button, the Escape key, clicking outside, or
// clicking the badge again. Only one box is open at a time.

let openHelp = null; // { el, anchor }

function closeHelpPopover() {
	if (!openHelp) return;
	openHelp.anchor?.setAttribute?.("aria-expanded", "false");
	openHelp.el.remove();
	openHelp = null;
}

function openHelpPopover(anchor) {
	closeHelpPopover();
	const text = anchor.getAttribute("data-help") || "";
	if (!text) return;

	const pop = document.createElement("div");
	pop.className = "col-help-popover";
	pop.setAttribute("role", "note");

	const close = document.createElement("button");
	close.type = "button";
	close.className = "col-help-popover-close";
	close.setAttribute("aria-label", "Close");
	close.innerHTML = "&times;";
	pop.appendChild(close);

	// Title the box with the column name when the badge sits in a header cell
	// (truncated body cells have no title — the box just shows the full value).
	const th = anchor.closest("th");
	const title = (th?.dataset?.label ?? th?.textContent ?? "").replace(/[?⇅▲▼]/g, "").trim();
	if (title) {
		const heading = document.createElement("div");
		heading.className = "col-help-popover-title";
		heading.textContent = title;
		pop.appendChild(heading);
	}

	const body = document.createElement("div");
	body.className = "col-help-popover-body";
	body.textContent = text;
	pop.appendChild(body);

	document.body.appendChild(pop);

	// Position under the badge, clamped to the viewport width; the arrow keeps
	// pointing at the badge even when the box itself is clamped.
	const r = anchor.getBoundingClientRect();
	const margin = 8;
	const w = pop.offsetWidth;
	let left = window.scrollX + r.left + r.width / 2 - w / 2;
	const maxLeft = window.scrollX + document.documentElement.clientWidth - w - margin;
	left = Math.max(window.scrollX + margin, Math.min(left, maxLeft));
	pop.style.left = `${left}px`;
	pop.style.top = `${window.scrollY + r.bottom + 6}px`;
	const arrowLeft = window.scrollX + r.left + r.width / 2 - left;
	pop.style.setProperty("--arrow-left", `${Math.max(10, Math.min(arrowLeft, w - 10))}px`);

	anchor.setAttribute("aria-expanded", "true");
	openHelp = { el: pop, anchor };
}

function toggleHelpPopover(badge) {
	if (openHelp && openHelp.anchor === badge) closeHelpPopover();
	else openHelpPopover(badge);
}

document.addEventListener("click", (e) => {
	if (e.target.closest?.(".col-help-popover-close")) { closeHelpPopover(); return; }
	if (e.target.closest?.(".col-help-popover")) return; // allow selecting text inside the box
	const badge = e.target.closest?.(".col-help, .cell-more");
	if (badge) { toggleHelpPopover(badge); return; }
	closeHelpPopover(); // any other click closes the box
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") { closeHelpPopover(); return; }
	if (e.key !== "Enter" && e.key !== " ") return;
	const badge = e.target.closest?.(".col-help, .cell-more");
	if (badge) { e.preventDefault(); toggleHelpPopover(badge); }
});

export { closeHelpPopover };

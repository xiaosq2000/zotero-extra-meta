#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const extra = require(path.join(root, "content/extra.js"));
const venues = require(path.join(root, "content/venues.js"));

// 1. Extra parsing, CRLF, alias cleanup, venue tag helpers, and non-truncating arXiv rules
assert.equal(extra.getValue("tex.venueabbr: ICML\r\ntex.affiliation: MIT\r\n", "tex.venueabbr"), "ICML");
assert.equal(
	extra.setValue("tex.venueabbr: ICML\r\ntex.affiliation: MIT\r\n", "tex.venueabbr", "NeurIPS"),
	"tex.venueabbr: NeurIPS\ntex.affiliation: MIT\n"
);
assert.equal(extra.getVenueTag("tex.venuetag: Best Paper\ntex.venueaward: Oral"), "Best Paper");
assert.equal(extra.getVenueTag("tex.venueaward: Best Paper\ntex.venuetier: Oral"), "Best Paper");
assert.equal(extra.getVenueTag("tex.venuetier: Spotlight"), "Spotlight");
assert.equal(extra.getVenueTag("tex.venueabbr: ICML"), "");
assert.equal(extra.getVenueTag(""), "");
assert.equal(extra.isVenueTagAliasLine(extra.parseLine("tex.venueaward: Best Paper")), true);
assert.equal(extra.isVenueTagAliasLine(extra.parseLine("tex.venuetier: Oral")), true);
assert.equal(extra.isVenueTagAliasLine(extra.parseLine("tex.venuetag: Oral")), false);
assert.equal(extra.isVenueTagAliasLine(extra.parseLine("tex.venueabbr: ICLR")), false);
assert.equal(
	extra.setValue("tex.venueaward: Best Paper\ntex.venuetier: Oral", "tex.venuetag", "Best Paper, Oral", extra.isVenueTagAliasLine),
	"tex.venuetag: Best Paper, Oral"
);
assert.equal(
	extra.setValue("tex.venueabbr: RSS\ntex.venueaward: Best Paper", "tex.venuetag", "", extra.isVenueTagAliasLine),
	"tex.venueabbr: RSS"
);
assert.equal(
	extra.setValue("tex.openreview: https://openreview.net/forum?id=old123", "OpenReview", "", (p) => p.normalizedKey === "tex.openreview"),
	""
);
assert.equal(
	extra.setValue("Number: 12\nNumber: arXiv:2501.00001", "arXiv", "", (p) => p.normalizedKey === "number" && /^arXiv:/i.test(p.value)),
	"Number: 12"
);

assert.equal(extra.normalizeOpenReviewInput("AbCdEf1234"), "https://openreview.net/forum?id=AbCdEf1234");
assert.equal(extra.normalizeOpenReviewInput("openreview.net/pdf?id=AbCdEf&noteId=XyZ"), "https://openreview.net/forum?id=AbCdEf&noteId=XyZ");
assert.equal(extra.normalizeOpenReviewInput("https://example.com/forum?id=AbCdEf"), "");

assert.deepEqual(extra.parseArxiv("2301.123456"), {
	id: "2301.123456",
	category: "",
	url: "",
	raw: "2301.123456",
});
assert.deepEqual(extra.parseArxiv("2301.12345 trailing note"), {
	id: "2301.12345 trailing note",
	category: "",
	url: "",
	raw: "2301.12345 trailing note",
});
assert.deepEqual(extra.parseArxiv("https://arxiv.org/html/2501.00001v1/"), {
	id: "2501.00001v1",
	category: "",
	url: "https://arxiv.org/abs/2501.00001v1",
	raw: "https://arxiv.org/html/2501.00001v1/",
});
assert.deepEqual(extra.parseArxiv("https://arxiv.org/abs/not/an/id"), {
	id: "https://arxiv.org/abs/not/an/id",
	category: "",
	url: "",
	raw: "https://arxiv.org/abs/not/an/id",
});
assert.equal(extra.normalizeArxivInput("https://export.arxiv.org/pdf/2501.00001v2.pdf"), "2501.00001v2");

const encoded = extra.encodeLinks("tex.sourcecode: https://github.com/org/repo?a=1 | b=2\ntex.openreview: AbCdEf1234");
const decoded = extra.decodeLinks(encoded);
assert.equal(decoded.length, 2);
assert.equal(decoded[0].icon, "github");
assert.equal(decoded[1].url, "https://openreview.net/forum?id=AbCdEf1234");
assert.equal(extra.encodeLinks(""), "");

// 2. Venue tone matching, distinction classification, dual-source parsing, and encoding
assert.equal(venues.resolveTone("ICRA'24"), "orange");
assert.equal(venues.resolveTone("NeurIPS '25 Workshop"), "purple");
assert.equal(venues.resolveTone("RA-L 2024"), "gold");
assert.equal(venues.resolveTone("ICRA-W"), "orange");
assert.equal(venues.resolveTone("NeurIPS (Oral)"), "purple");
assert.equal(venues.resolveTone("RSS 2024 Best Paper"), "green");
assert.equal(venues.resolveTone("TASE"), "gold");
assert.equal(venues.resolveTone("T-ASE 2021"), "gold");
assert.equal(venues.resolveTone("RLJ"), "cyan");
assert.equal(venues.resolveTone("RLC 2026"), "cyan");

// 2a. Distinction classification and rank hierarchy
assert.equal(venues.classifyDistinction(""), null);
assert.equal(venues.classifyDistinction("   "), null);
assert.deepEqual(venues.classifyDistinction("best paper finalist"), { kind: "finalist", label: "Best Paper Finalist", rank: 4 });
assert.deepEqual(venues.classifyDistinction("Best Paper Award Finalist"), { kind: "finalist", label: "Best Paper Finalist", rank: 4 });
assert.deepEqual(venues.classifyDistinction("best student paper finalist"), { kind: "finalist", label: "Best Student Paper Finalist", rank: 4 });
assert.deepEqual(venues.classifyDistinction("Best Student Paper Award Finalist"), { kind: "finalist", label: "Best Student Paper Finalist", rank: 4 });
assert.deepEqual(venues.classifyDistinction("best systems paper nominee"), { kind: "finalist", label: "Best Systems Paper Nominee", rank: 4 });
assert.deepEqual(venues.classifyDistinction("honorable mention"), { kind: "finalist", label: "Honorable Mention", rank: 4 });
assert.deepEqual(venues.classifyDistinction("runner-up"), { kind: "finalist", label: "Runner-Up", rank: 4 });
assert.deepEqual(venues.classifyDistinction("runner up"), { kind: "finalist", label: "Runner-Up", rank: 4 });
assert.deepEqual(venues.classifyDistinction("best paper"), { kind: "award", label: "Best Paper", rank: 5 });
assert.deepEqual(venues.classifyDistinction("Best Paper Award"), { kind: "award", label: "Best Paper", rank: 5 });
assert.deepEqual(venues.classifyDistinction("best student paper award"), { kind: "award", label: "Best Student Paper", rank: 5 });
assert.deepEqual(venues.classifyDistinction("best systems paper award"), { kind: "award", label: "Best Systems Paper", rank: 5 });
assert.deepEqual(venues.classifyDistinction("best demo"), { kind: "award", label: "Best Demo", rank: 5 });
assert.deepEqual(venues.classifyDistinction("Best Demo Award"), { kind: "award", label: "Best Demo", rank: 5 });
assert.deepEqual(venues.classifyDistinction("outstanding paper"), { kind: "award", label: "Outstanding Paper", rank: 5 });
assert.deepEqual(venues.classifyDistinction("oral presentation"), { kind: "oral", label: "Oral", rank: 3 });
assert.deepEqual(venues.classifyDistinction("keynote"), { kind: "oral", label: "Keynote", rank: 3 });
assert.deepEqual(venues.classifyDistinction("spotlight presentation"), { kind: "spotlight", label: "Spotlight", rank: 2 });
assert.deepEqual(venues.classifyDistinction("highlight"), { kind: "spotlight", label: "Highlight", rank: 2 });
assert.deepEqual(venues.classifyDistinction("workshop"), { kind: "track", label: "Workshop", rank: 0 });
assert.deepEqual(venues.classifyDistinction("findings"), { kind: "track", label: "Findings", rank: 0 });
assert.deepEqual(venues.classifyDistinction("demo"), { kind: "track", label: "Demo", rank: 0 });
assert.deepEqual(venues.classifyDistinction("datasets and benchmarks"), { kind: "track", label: "Datasets & Benchmarks", rank: 0 });
assert.deepEqual(venues.classifyDistinction("  Early   Accept  "), { kind: "custom", label: "Early Accept", rank: 1 });

// 2b. normalizeVenueTags deduplication and rank ordering
assert.equal(venues.normalizeVenueTags(""), "");
assert.equal(venues.normalizeVenueTags("  ; , "), "");
assert.equal(venues.normalizeVenueTags("workshop; oral, best paper, ORAL"), "Best Paper, Oral, Workshop");
assert.equal(venues.normalizeVenueTags("datasets and benchmarks, spotlight, best paper finalist"), "Best Paper Finalist, Spotlight, Datasets & Benchmarks");
assert.equal(venues.normalizeVenueTags("Early Accept, workshop, best paper"), "Best Paper, Early Accept, Workshop");

// 2c. Dual-source parseVenue (inline parentheses, delimited, bare suffix, merging, edge cases)
assert.deepEqual(venues.parseVenue("RA-L 2024"), {
	venue: "RA-L 2024",
	tone: "gold",
	distinctions: [],
	topKind: null,
	tooltip: "RA-L 2024",
});
assert.deepEqual(venues.parseVenue("ICRA-W"), {
	venue: "ICRA-W",
	tone: "orange",
	distinctions: [],
	topKind: null,
	tooltip: "ICRA-W",
});
assert.deepEqual(venues.parseVenue("T-RO"), {
	venue: "T-RO",
	tone: "gold",
	distinctions: [],
	topKind: null,
	tooltip: "T-RO",
});
assert.deepEqual(venues.parseVenue("Workshop"), {
	venue: "Workshop",
	tone: venues.resolveTone("Workshop"),
	distinctions: [],
	topKind: null,
	tooltip: "Workshop",
});
assert.deepEqual(venues.parseVenue("Best Paper Finalist"), {
	venue: "Best Paper Finalist",
	tone: venues.resolveTone("Best Paper Finalist"),
	distinctions: [],
	topKind: null,
	tooltip: "Best Paper Finalist",
});
assert.deepEqual(venues.parseVenue("Best Demo"), {
	venue: "Best Demo",
	tone: venues.resolveTone("Best Demo"),
	distinctions: [],
	topKind: null,
	tooltip: "Best Demo",
});
assert.deepEqual(venues.parseVenue("ICML 2024 Distinguished Paper Honorable Mention"), {
	venue: "ICML 2024",
	tone: "blue",
	distinctions: [{ kind: "finalist", label: "Distinguished Paper Honorable Mention", rank: 4 }],
	topKind: "finalist",
	tooltip: "ICML 2024 — Distinguished Paper Honorable Mention",
});
assert.deepEqual(venues.parseVenue("ICML 2024 Outstanding Paper Award Honorable Mention"), {
	venue: "ICML 2024",
	tone: "blue",
	distinctions: [{ kind: "finalist", label: "Outstanding Paper Honorable Mention", rank: 4 }],
	topKind: "finalist",
	tooltip: "ICML 2024 — Outstanding Paper Honorable Mention",
});
assert.deepEqual(venues.parseVenue("NeurIPS 2025 (Oral)"), {
	venue: "NeurIPS 2025",
	tone: "purple",
	distinctions: [{ kind: "oral", label: "Oral", rank: 3 }],
	topKind: "oral",
	tooltip: "NeurIPS 2025 — Oral",
});
assert.deepEqual(venues.parseVenue("ICLR 2025 (Oral, Best Paper)"), {
	venue: "ICLR 2025",
	tone: "cyan",
	distinctions: [
		{ kind: "award", label: "Best Paper", rank: 5 },
		{ kind: "oral", label: "Oral", rank: 3 },
	],
	topKind: "award",
	tooltip: "ICLR 2025 — Best Paper, Oral",
});
assert.deepEqual(venues.parseVenue("RSS - Best Paper Finalist"), {
	venue: "RSS",
	tone: "green",
	distinctions: [{ kind: "finalist", label: "Best Paper Finalist", rank: 4 }],
	topKind: "finalist",
	tooltip: "RSS — Best Paper Finalist",
});
assert.deepEqual(venues.parseVenue("ICLR | Spotlight"), {
	venue: "ICLR",
	tone: "cyan",
	distinctions: [{ kind: "spotlight", label: "Spotlight", rank: 2 }],
	topKind: "spotlight",
	tooltip: "ICLR — Spotlight",
});
assert.deepEqual(venues.parseVenue("NeurIPS '25 Workshop"), {
	venue: "NeurIPS '25",
	tone: "purple",
	distinctions: [{ kind: "track", label: "Workshop", rank: 0 }],
	topKind: "track",
	tooltip: "NeurIPS '25 — Workshop",
});
assert.deepEqual(venues.parseVenue("RSS 2024 Best Paper Finalist"), {
	venue: "RSS 2024",
	tone: "green",
	distinctions: [{ kind: "finalist", label: "Best Paper Finalist", rank: 4 }],
	topKind: "finalist",
	tooltip: "RSS 2024 — Best Paper Finalist",
});
assert.deepEqual(venues.parseVenue("CoRL 2025 Best Paper Award Finalist"), {
	venue: "CoRL 2025",
	tone: "teal",
	distinctions: [{ kind: "finalist", label: "Best Paper Finalist", rank: 4 }],
	topKind: "finalist",
	tooltip: "CoRL 2025 — Best Paper Finalist",
});
assert.deepEqual(venues.parseVenue("CVPR 2024 Best Demo"), {
	venue: "CVPR 2024",
	tone: "plum",
	distinctions: [{ kind: "award", label: "Best Demo", rank: 5 }],
	topKind: "award",
	tooltip: "CVPR 2024 — Best Demo",
});
assert.deepEqual(venues.parseVenue("CVPR 2024 Demo"), {
	venue: "CVPR 2024",
	tone: "plum",
	distinctions: [{ kind: "track", label: "Demo", rank: 0 }],
	topKind: "track",
	tooltip: "CVPR 2024 — Demo",
});
assert.deepEqual(venues.parseVenue("NeurIPS (Best Paper)", "oral, best paper"), {
	venue: "NeurIPS",
	tone: "purple",
	distinctions: [
		{ kind: "award", label: "Best Paper", rank: 5 },
		{ kind: "oral", label: "Oral", rank: 3 },
	],
	topKind: "award",
	tooltip: "NeurIPS — Best Paper, Oral",
});
assert.deepEqual(venues.parseVenue("", "Best Paper"), {
	venue: "",
	tone: "muted",
	distinctions: [{ kind: "award", label: "Best Paper", rank: 5 }],
	topKind: "award",
	tooltip: "Best Paper",
});
assert.deepEqual(venues.parseVenue("CoRL", "Early Accept"), {
	venue: "CoRL",
	tone: "teal",
	distinctions: [{ kind: "custom", label: "Early Accept", rank: 1 }],
	topKind: "custom",
	tooltip: "CoRL — Early Accept",
});
assert.deepEqual(venues.parseVenue("", ""), {
	venue: "",
	tone: "muted",
	distinctions: [],
	topKind: null,
	tooltip: "",
});

// 2d. encodeVenueData / decodeVenueData round-trips and sorting order
assert.equal(venues.encodeVenueData("", ""), "");
assert.equal(venues.encodeVenueData("NeurIPS", ""), "NeurIPS");
assert.equal(venues.encodeVenueData("NeurIPS", "oral, best paper"), "NeurIPS · Best Paper, Oral");
assert.equal(venues.encodeVenueData("", "Best Paper"), "· Best Paper");
assert.equal(venues.encodeVenueData("CoRL", "Special Track"), "CoRL · Special Track");

assert.deepEqual(venues.decodeVenueData(""), venues.parseVenue("", ""));
assert.deepEqual(venues.decodeVenueData("NeurIPS"), venues.parseVenue("NeurIPS", ""));
assert.deepEqual(venues.decodeVenueData("NeurIPS · Best Paper, Oral"), venues.parseVenue("NeurIPS", "Best Paper, Oral"));
assert.deepEqual(venues.decodeVenueData("· Best Paper"), venues.parseVenue("", "Best Paper"));
assert.deepEqual(venues.decodeVenueData("CoRL · Special Track"), venues.parseVenue("CoRL", "Special Track"));
assert.deepEqual(venues.decodeVenueData("NeurIPS '25 Workshop"), venues.parseVenue("NeurIPS '25 Workshop", ""));

const sortedVenues = [
	venues.encodeVenueData("NeurIPS", "Oral"),
	venues.encodeVenueData("ICLR", "Oral"),
	venues.encodeVenueData("NeurIPS", "Best Paper"),
	venues.encodeVenueData("NeurIPS", ""),
].sort();
assert.deepEqual(sortedVenues, [
	"ICLR · Oral",
	"NeurIPS",
	"NeurIPS · Best Paper",
	"NeurIPS · Oral",
]);

// 3. Sandboxed main.js checks (window isolation, mixed batch edit, undoAction, keyboard isolation)
function makeFakeElement(tag) {
	const listeners = new Map();
	return {
		tagName: tag,
		attributes: {},
		dataset: {},
		children: [],
		placeholder: "",
		textContent: "",
		setAttribute(k, v) {
			this.attributes[k] = String(v);
		},
		appendChild(child) {
			this.children.push(child);
			return child;
		},
		addEventListener(type, fn) {
			if (!listeners.has(type)) {
				listeners.set(type, []);
			}
			listeners.get(type).push(fn);
		},
		dispatch(type, event) {
			for (const fn of listeners.get(type) || []) {
				fn(event);
			}
		},
	};
}

function makeItem(id, extraText) {
	const saves = [];
	return {
		id,
		extra: extraText,
		saves,
		isRegularItem: () => true,
		isEditable: () => true,
		getField: (name) => (name === "extra" ? extraText : ""),
		setField: (name, val) => {
			if (name === "extra") {
				extraText = val;
			}
		},
		save: async (opts) => {
			saves.push(opts);
		},
	};
}

async function runMainTests() {
	const columns = [];
	const rows = [];
	const launchedUrls = [];
	const refreshCalls = [];

	const itemA = makeItem(1, "tex.venueabbr: ICML\ntex.openreview: https://openreview.net/forum?id=abc123\nNumber: 12\nNumber: arXiv:2501.00001");
	const itemB = makeItem(2, "tex.venueabbr: NeurIPS");
	const itemC = makeItem(3, "tex.venueabbr: NeurIPS");

	const valueElems = new Map();
	function makeBox(item, extraItems) {
		return {
			item,
			extraItems,
			isConnected: true,
			querySelector(sel) {
				const match = /data-custom-row-id="([^"]+)"/.exec(sel);
				if (!match) {
					return null;
				}
				const key = match[1];
				if (!valueElems.has(key)) {
					valueElems.set(key, makeFakeElement("editable-text"));
				}
				return valueElems.get(key);
			},
		};
	}

	let activeBox = makeBox(itemA, []);
	const secondaryWindowBox = makeBox(itemA, [itemC]);

	const unregisteredColumns = [];
	const unregisteredRows = [];
	const sandbox = {
		ExtraMetaExtra: extra,
		ExtraMetaVenues: venues,
		CSS: { escape: (s) => s },
		Localization: function () {
			this.formatValueSync = (id) => ({
				"extra-meta-col-venue": "会议/期刊",
				"extra-meta-row-venue": "会议/期刊",
				"extra-meta-row-venuetag": "会议标签",
				"extra-meta-row-openreview": "OpenReview",
				"extra-meta-row-arxiv": "arXiv",
			}[id] || "");
		},
		Zotero: {
			launchURL: (url) => launchedUrls.push(url),
			logError: (err) => { throw err; },
			getString: (id) => (id === "item-pane-batch-editing-multiple-values-placeholder" ? "Multiple" : id),
			getMainWindow: () => ({ ZoteroPane: { itemPane: { querySelector: () => activeBox } } }),
			getMainWindows: () => [
				{ document: { querySelectorAll: () => [secondaryWindowBox] } },
				{ document: { querySelectorAll: () => [activeBox] } },
			],
			DB: { executeTransaction: async (fn) => fn() },
			ItemTreeManager: {
				registerColumn: (col) => {
					columns.push(col);
					return `col-${col.dataKey}`;
				},
				unregisterColumn: (id) => unregisteredColumns.push(id),
			},
			ItemPaneManager: {
				registerInfoRow: (row) => {
					const fullID = `extra-meta@dotfiles.local-${row.rowID}`;
					rows.push({ ...row, rowID: fullID });
					return fullID;
				},
				unregisterInfoRow: (id) => unregisteredRows.push(id),
				refreshInfoRow: (id) => refreshCalls.push(id),
			},
		},
	};
	vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(path.join(root, "content/main.js"), "utf8"), sandbox);
	sandbox.ExtraMetaMain.init({ pluginID: "extra-meta@dotfiles.local" });

	assert.equal(columns[0].label, "会议/期刊");
	assert.equal(columns[0].width, "140");
	assert.equal(columns[0].minWidth, 72);
	assert.equal(rows[0].rowID.endsWith("em-venue"), true);
	assert.equal(rows[1].rowID.endsWith("em-venuetag"), true);

	// Keyboard isolation on cell buttons
	const fakeDoc = { createElementNS: (_ns, tag) => makeFakeElement(tag) };
	const venueCol = columns.find((c) => c.dataKey === "venue");
	const arxivCol = columns.find((c) => c.dataKey === "arxiv");
	const cell = arxivCol.renderCell(0, "2501.00001", {}, false, fakeDoc);
	const button = cell.children[0];
	let stopped = false;
	let prevented = false;
	button.dispatch("keydown", {
		key: "Enter",
		stopPropagation: () => { stopped = true; },
		preventDefault: () => { prevented = true; },
	});
	assert.equal(stopped, true);
	assert.equal(prevented, true);
	assert.deepEqual(launchedUrls, ["https://arxiv.org/abs/2501.00001"]);

	let tabStopped = false;
	button.dispatch("keydown", {
		key: "Tab",
		stopPropagation: () => { tabStopped = true; },
		preventDefault: () => {},
	});
	assert.equal(tabStopped, false);

	function countSvgDescendants(node) {
		let count = node.tagName === "svg" ? 1 : 0;
		for (const child of node.children || []) {
			count += countSvgDescendants(child);
		}
		return count;
	}

	// Venue column dataProvider and renderCell (plain badge, independent badge group, multi-tag, tag-only, first-column, zero SVGs)
	const plainItem = makeItem(10, "tex.venueabbr: CoRL");
	const awardItem = makeItem(11, "tex.venueabbr: NeurIPS\ntex.venuetag: oral, best paper");
	const aliasInlineItem = makeItem(12, "tex.venueabbr: RSS 2024 (Oral)\ntex.venueaward: Best Paper");
	const tagOnlyItem = makeItem(13, "tex.venuetier: Spotlight");
	assert.equal(venueCol.dataProvider(plainItem), "CoRL");
	assert.equal(venueCol.dataProvider(awardItem), "NeurIPS · Best Paper, Oral");
	assert.equal(venueCol.dataProvider(aliasInlineItem), "RSS 2024 · Best Paper, Oral");
	assert.equal(venueCol.dataProvider(tagOnlyItem), "· Spotlight");

	const emptyVenueCell = venueCol.renderCell(0, "", {}, false, fakeDoc);
	assert.equal(emptyVenueCell.children.length, 0);

	const plainVenueCell = venueCol.renderCell(0, "CoRL", {}, false, fakeDoc);
	const plainBadge = plainVenueCell.children[0];
	assert.equal(plainBadge.className, "em-venue-badge");
	assert.equal(plainBadge.dataset.tone, "teal");
	assert.equal(plainBadge.attributes.title, "CoRL");
	assert.equal(plainBadge.children.length, 1);
	assert.equal(plainBadge.children[0].className, "em-venue-label");
	assert.equal(plainBadge.children[0].textContent, "CoRL");
	assert.equal(countSvgDescendants(plainVenueCell), 0);

	const groupedCell = venueCol.renderCell(0, "NeurIPS · Best Paper", {}, false, fakeDoc);
	const group = groupedCell.children[0];
	assert.equal(group.className, "em-venue-group");
	assert.equal(group.attributes.title, "NeurIPS — Best Paper");
	assert.equal(group.children.length, 2);
	assert.equal(group.children[0].className, "em-venue-badge");
	assert.equal(group.children[0].dataset.tone, "purple");
	assert.equal(group.children[0].children.length, 1);
	assert.equal(group.children[0].children[0].className, "em-venue-label");
	assert.equal(group.children[0].children[0].textContent, "NeurIPS");
	assert.equal(group.children[1].className, "em-venue-tag");
	assert.equal(group.children[1].dataset.kind, "award");
	assert.equal(group.children[1].children.length, 1);
	assert.equal(group.children[1].children[0].className, "em-venue-label");
	assert.equal(group.children[1].children[0].textContent, "Best Paper");
	assert.equal(countSvgDescendants(groupedCell), 0);

	const multiTagCell = venueCol.renderCell(0, "ICLR 2025 · Best Paper Finalist, Oral, Spotlight, Workshop", {}, false, fakeDoc);
	const multiGroup = multiTagCell.children[0];
	assert.equal(multiGroup.className, "em-venue-group");
	assert.equal(multiGroup.attributes.title, "ICLR 2025 — Best Paper Finalist, Oral, Spotlight, Workshop");
	assert.equal(multiGroup.children.length, 5);
	assert.equal(multiGroup.children[0].className, "em-venue-badge");
	assert.equal(multiGroup.children[0].dataset.tone, "cyan");
	assert.equal(multiGroup.children[0].children[0].className, "em-venue-label");
	assert.equal(multiGroup.children[0].children[0].textContent, "ICLR 2025");
	assert.equal(multiGroup.children[1].className, "em-venue-tag");
	assert.equal(multiGroup.children[1].dataset.kind, "finalist");
	assert.equal(multiGroup.children[1].children.length, 1);
	assert.equal(multiGroup.children[1].children[0].className, "em-venue-label");
	assert.equal(multiGroup.children[1].children[0].textContent, "Best Paper Finalist");
	assert.equal(multiGroup.children[2].className, "em-venue-tag");
	assert.equal(multiGroup.children[2].dataset.kind, "oral");
	assert.equal(multiGroup.children[2].children.length, 1);
	assert.equal(multiGroup.children[2].children[0].className, "em-venue-label");
	assert.equal(multiGroup.children[2].children[0].textContent, "Oral");
	assert.equal(multiGroup.children[3].className, "em-venue-tag");
	assert.equal(multiGroup.children[3].dataset.kind, "spotlight");
	assert.equal(multiGroup.children[3].children.length, 1);
	assert.equal(multiGroup.children[3].children[0].className, "em-venue-label");
	assert.equal(multiGroup.children[3].children[0].textContent, "Spotlight");
	assert.equal(multiGroup.children[4].className, "em-venue-tag");
	assert.equal(multiGroup.children[4].dataset.kind, "track");
	assert.equal(multiGroup.children[4].children.length, 1);
	assert.equal(multiGroup.children[4].children[0].className, "em-venue-label");
	assert.equal(multiGroup.children[4].children[0].textContent, "Workshop");
	assert.equal(countSvgDescendants(multiTagCell), 0);

	const tagOnlyCell = venueCol.renderCell(0, "· Best Paper", {}, false, fakeDoc);
	const tagOnlyGroup = tagOnlyCell.children[0];
	assert.equal(tagOnlyGroup.className, "em-venue-group");
	assert.equal(tagOnlyGroup.attributes.title, "Best Paper");
	assert.equal(tagOnlyGroup.children.length, 1);
	assert.equal(tagOnlyGroup.children[0].className, "em-venue-tag");
	assert.equal(tagOnlyGroup.children[0].dataset.kind, "award");
	assert.equal(tagOnlyGroup.children[0].children.length, 1);
	assert.equal(tagOnlyGroup.children[0].children[0].className, "em-venue-label");
	assert.equal(tagOnlyGroup.children[0].children[0].textContent, "Best Paper");
	assert.equal(countSvgDescendants(tagOnlyCell), 0);

	// First-column cells include .cell-text so Zotero preserves button listeners and flex wrapping
	const firstVenueCell = venueCol.renderCell(0, "CoRL", {}, true, fakeDoc);
	assert.match(firstVenueCell.children[0].className, /\bcell-text\b/);
	assert.equal(firstVenueCell.children[0].children[0].className, "em-venue-badge");

	const firstGroupedVenueCell = venueCol.renderCell(0, "NeurIPS · Oral", {}, true, fakeDoc);
	assert.match(firstGroupedVenueCell.children[0].className, /\bcell-text\b/);
	assert.equal(firstGroupedVenueCell.children[0].children[0].className, "em-venue-group");
	assert.equal(countSvgDescendants(firstGroupedVenueCell), 0);

	const firstArxivCell = arxivCol.renderCell(0, "2501.00001", {}, true, fakeDoc);
	assert.match(firstArxivCell.children[0].className, /\bcell-text\b/);
	assert.equal(firstArxivCell.children[0].children[0].tagName, "button");

	// Active window isolation: editing itemA in activeBox must NOT modify itemC in secondaryWindowBox
	const venueRow = rows.find((r) => r.rowID.endsWith("em-venue"));
	assert.equal(venueRow.onGetData({ rowID: venueRow.rowID, item: itemA, tabType: "library" }), "ICML");
	venueRow.onSetData({ rowID: venueRow.rowID, item: itemA, tabType: "library", value: "ICLR" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getValue(itemA.getField("extra"), "tex.venueabbr"), "ICLR");
	assert.equal(extra.getValue(itemC.getField("extra"), "tex.venueabbr"), "NeurIPS");
	assert.deepEqual(JSON.parse(JSON.stringify(itemA.saves[0])), {
		undoAction: "undo-action-edit-field",
		undoActionArgs: { field: "会议/期刊", count: 1 },
	});

	// Clearing OpenReview and arXiv aliases leaves Number: 12 intact
	const openReviewRow = rows.find((r) => r.rowID.endsWith("em-openreview"));
	openReviewRow.onSetData({ rowID: openReviewRow.rowID, item: itemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(openReviewRow.onGetData({ rowID: openReviewRow.rowID, item: itemA, tabType: "library" }), "");

	const arxivRow = rows.find((r) => r.rowID.endsWith("em-arxiv"));
	arxivRow.onSetData({ rowID: arxivRow.rowID, item: itemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(arxivRow.onGetData({ rowID: arxivRow.rowID, item: itemA, tabType: "library" }), "");
	assert.equal(extra.getValue(itemA.getField("extra"), "Number"), "12");

	// Mixed batch editing: blur without edit preserves values; Backspace + blur clears all items
	activeBox = makeBox(itemA, [itemB]);
	assert.equal(venueRow.onGetData({ rowID: venueRow.rowID, item: itemA, tabType: "library" }), "");
	const venueElem = valueElems.get(venueRow.rowID);
	assert.equal(venueElem.placeholder, "Multiple");

	venueRow.onSetData({ rowID: venueRow.rowID, item: itemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getValue(itemA.getField("extra"), "tex.venueabbr"), "ICLR");
	assert.equal(extra.getValue(itemB.getField("extra"), "tex.venueabbr"), "NeurIPS");

	venueElem.dispatch("keydown", { key: "Backspace" });
	assert.equal(venueElem.placeholder, "");
	venueRow.onSetData({ rowID: venueRow.rowID, item: itemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getValue(itemA.getField("extra"), "tex.venueabbr"), "");
	assert.equal(extra.getValue(itemB.getField("extra"), "tex.venueabbr"), "");

	// Venue Tag Info row: alias read, normalization + alias cleanup, refresh, and mixed batch edit
	const venueTagRow = rows.find((r) => r.rowID.endsWith("em-venuetag"));
	const tagItemA = makeItem(20, "tex.venueabbr: NeurIPS\ntex.venueaward: Oral");
	const tagItemB = makeItem(21, "tex.venueabbr: ICLR\ntex.venuetier: Spotlight");
	activeBox = makeBox(tagItemA, []);

	assert.equal(venueTagRow.onGetData({ rowID: venueTagRow.rowID, item: tagItemA, tabType: "library" }), "Oral");
	const refreshCountBefore = refreshCalls.length;
	venueTagRow.onSetData({ rowID: venueTagRow.rowID, item: tagItemA, tabType: "library", value: "oral, best paper" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getValue(tagItemA.getField("extra"), "tex.venuetag"), "Best Paper, Oral");
	assert.equal(extra.getValue(tagItemA.getField("extra"), "tex.venueaward"), "");
	assert.equal(extra.getValue(tagItemA.getField("extra"), "tex.venueabbr"), "NeurIPS");
	assert.equal(refreshCalls.length, refreshCountBefore + 1);
	assert.deepEqual(JSON.parse(JSON.stringify(tagItemA.saves[0])), {
		undoAction: "undo-action-edit-field",
		undoActionArgs: { field: "会议标签", count: 1 },
	});

	activeBox = makeBox(tagItemA, [tagItemB]);
	assert.equal(venueTagRow.onGetData({ rowID: venueTagRow.rowID, item: tagItemA, tabType: "library" }), "");
	const venueTagElem = valueElems.get(venueTagRow.rowID);
	assert.equal(venueTagElem.placeholder, "Multiple");

	venueTagRow.onSetData({ rowID: venueTagRow.rowID, item: tagItemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getVenueTag(tagItemA.getField("extra")), "Best Paper, Oral");
	assert.equal(extra.getVenueTag(tagItemB.getField("extra")), "Spotlight");

	venueTagElem.dispatch("keydown", { key: "Backspace" });
	assert.equal(venueTagElem.placeholder, "");
	venueTagRow.onSetData({ rowID: venueTagRow.rowID, item: tagItemA, tabType: "library", value: "" });
	await new Promise((r) => setImmediate(r));
	assert.equal(extra.getVenueTag(tagItemA.getField("extra")), "");
	assert.equal(extra.getVenueTag(tagItemB.getField("extra")), "");
	assert.equal(extra.getValue(tagItemB.getField("extra"), "tex.venuetier"), "");

	// Stylesheet cache-busting across init() and hot-reload replacement in addToWindow()
	const insertedFtl = [];
	const headNodes = [];
	const fakeWin = {
		MozXULElement: { insertFTLIfNeeded: (file) => insertedFtl.push(file) },
		document: {
			createElementNS: (_ns, tag) => {
				const el = makeFakeElement(tag);
				el.remove = () => {
					const idx = headNodes.indexOf(el);
					if (idx !== -1) {
						headNodes.splice(idx, 1);
					}
				};
				return el;
			},
			getElementById: (id) => headNodes.find((n) => n.id === id) || null,
			querySelector: (sel) => {
				const m = /^link\[href="([^"]+)"\]$/.exec(sel);
				return m ? (headNodes.find((n) => n.tagName === "link" && n.href === m[1]) || null) : null;
			},
			documentElement: {
				appendChild: (node) => {
					headNodes.push(node);
					return node;
				},
			},
		},
	};

	sandbox.ExtraMetaMain.addToWindow(fakeWin);
	assert.deepEqual(insertedFtl, ["extra-meta.ftl"]);
	const firstStyleLink = fakeWin.document.getElementById("extra-meta-styles");
	assert.ok(firstStyleLink);
	assert.equal(firstStyleLink.rel, "stylesheet");
	assert.match(firstStyleLink.href, /^chrome:\/\/extra-meta\/content\/styles\.css\?v=\d+-\d+$/);

	// Idempotent addToWindow within the same init() keeps the existing stylesheet link
	sandbox.ExtraMetaMain.addToWindow(fakeWin);
	assert.equal(headNodes.length, 1);
	assert.equal(fakeWin.document.getElementById("extra-meta-styles"), firstStyleLink);

	// Shutdown cleanup unregisters all columns and info rows
	sandbox.ExtraMetaMain.destroy();
	assert.equal(unregisteredColumns.length, columns.length);
	assert.equal(unregisteredRows.length, rows.length);

	// Re-init generates a fresh cache-busted stylesheet URI and replaces any stale <link>
	sandbox.ExtraMetaMain.init({ pluginID: "extra-meta@dotfiles.local" });
	sandbox.ExtraMetaMain.addToWindow(fakeWin);
	const secondStyleLink = fakeWin.document.getElementById("extra-meta-styles");
	assert.ok(secondStyleLink);
	assert.equal(headNodes.length, 1);
	assert.notEqual(secondStyleLink.href, firstStyleLink.href);
	assert.match(secondStyleLink.href, /^chrome:\/\/extra-meta\/content\/styles\.css\?v=\d+-\d+$/);

	sandbox.ExtraMetaMain.removeFromWindow(fakeWin);
	assert.equal(fakeWin.document.getElementById("extra-meta-styles"), null);
	sandbox.ExtraMetaMain.destroy();
}

runMainTests()
	.then(() => console.log("ok       Extra Meta: extra parser, venue tags & badges, batch editing, aliases and keyboard isolation"))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});

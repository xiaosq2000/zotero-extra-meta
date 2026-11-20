/*
 * Venue badge tone mapping, distinction/track classification, dual-source
 * parsing, and sortable column encoding/decoding. Zero Zotero dependencies
 * so unit tests can import it directly under Node.
 */

var ExtraMetaVenues = (function () {
	"use strict";

	const VENUE_TONES = new Map([
		// ML & Theory conferences
		["NEURIPS", "purple"],
		["NIPS", "purple"],
		["ICML", "blue"],
		["ICLR", "cyan"],
		["AISTATS", "indigo"],
		["COLT", "indigo"],
		["AAAI", "indigo"],
		["IJCAI", "indigo"],
		["UAI", "indigo"],
		["RLC", "cyan"],
		// NLP, Data & HCI conferences
		["ACL", "blue"],
		["EMNLP", "cyan"],
		["NAACL", "indigo"],
		["KDD", "indigo"],
		["WWW", "indigo"],
		["CHI", "coral"],
		// Robotics conferences
		["CORL", "teal"],
		["RSS", "green"],
		["ICRA", "orange"],
		["IROS", "coral"],
		["HUMANOIDS", "orange"],
		// Vision & Graphics
		["CVPR", "plum"],
		["ICCV", "plum"],
		["ECCV", "plum"],
		["SIGGRAPH", "plum"],
		// Journals & Transactions
		["RA-L", "gold"],
		["RAL", "gold"],
		["TRO", "gold"],
		["T-RO", "gold"],
		["TASE", "gold"],
		["T-ASE", "gold"],
		["IJRR", "teal"],
		["IJRA", "teal"],
		["JMLR", "blue"],
		["TMLR", "cyan"],
		["RLJ", "cyan"],
		["TPAMI", "plum"],
		["NC", "green"],
		["NECO", "green"],
		["ANN. MATH. STATIST.", "indigo"],
		["SCIENCE ROBOTICS", "gold"],
		["NATURE", "green"],
		["SCIENCE", "blue"],
		// Preprints
		["ARXIV", "muted"],
		["BIORXIV", "muted"],
		["MEDRXIV", "muted"],
		["PREPRINT", "muted"],
	]);

	const FALLBACK_TONES = ["blue", "purple", "teal", "green", "orange", "plum"];

	const MINOR_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

	const PAREN_DISTINCTION_HINT_RE = /\b(?:award|prize)\b|\btop[\s-]+\d+(?:\.\d+)?%/i;
	const TRAILING_PAREN_RE = /^(.+?)\s*\(([^()]+)\)$/;
	const INLINE_DELIMITER_RE = /(?:\s+[·|—–-]\s+|\s*:\s+)/g;

	const TRAILING_PHRASE_PATTERNS = [
		// Finalist / nominee / runner-up / honorable mention with prefix (before award & standalone)
		"best(?:\\s+[a-z0-9&'-]+){1,4}\\s+(?:finalist|nominee|runner[- ]up|honorable\\s+mention)",
		"(?:outstanding|distinguished)(?:\\s+[a-z0-9&'-]+){0,3}\\s+paper(?:\\s+award)?\\s+(?:finalist|nominee|runner[- ]up|honorable\\s+mention)",
		// Award phrases (before track & standalone)
		"best(?:\\s+[a-z0-9&'-]+){0,3}\\s+paper(?:\\s+award)?",
		"best(?:\\s+[a-z0-9&'-]+){0,2}\\s+demo(?:\\s+award)?",
		"best(?:\\s+[a-z0-9&'-]+){1,3}\\s+award",
		"best\\s+poster",
		"(?:outstanding|distinguished)(?:\\s+[a-z0-9&'-]+){0,3}\\s+paper(?:\\s+award)?",
		"test\\s+of\\s+time(?:\\s+award)?",
		// Standalone finalist phrases
		"honorable\\s+mention",
		"runner[- ]up",
		"finalist",
		// Oral phrases (longest first)
		"notable[\\s:-]+top[\\s-]+5%",
		"top[\\s-]+5%",
		"long\\s+oral(?:\\s+(?:presentation|talk))?",
		"short\\s+oral(?:\\s+(?:presentation|talk))?",
		"oral\\s+(?:presentation|talk)",
		"oral",
		"plenary(?:\\s+(?:talk|presentation))?",
		"keynote(?:\\s+(?:talk|presentation))?",
		"invited\\s+(?:talk|paper|presentation)",
		"invited",
		// Spotlight phrases (longest first)
		"notable[\\s:-]+top[\\s-]+25%",
		"spotlight\\s+(?:presentation|talk)",
		"spotlight",
		"highlight(?:\\s+(?:presentation|paper))?",
		"featured(?:\\s+(?:presentation|paper))?",
		"notable",
		// Track phrases (longest first)
		"datasets?\\s+(?:&|and)\\s+benchmarks?(?:\\s+track)?",
		"doctoral\\s+consortium",
		"journal\\s+track",
		"system(?:s)?\\s+demo(?:nstration)?",
		"position\\s+paper",
		"short\\s+paper",
		"workshop(?:\\s+(?:paper|track))?",
		"poster(?:\\s+presentation)?",
		"demo(?:nstration|\\s+(?:paper|track))?",
		"findings",
		"position",
		"short",
		"tutorial",
	];

	const TRAILING_PHRASE_REGEXES = TRAILING_PHRASE_PATTERNS.map(
		(pattern) => new RegExp(`^(.+)(?:,\\s*|\\s+)(${pattern})$`, "i")
	);

	function cleanText(raw) {
		return String(raw ?? "").replace(/\s+/g, " ").trim();
	}

	function toTitleCase(text) {
		const hasLower = /[a-z]/.test(text);
		return text.split(" ").map((word, index) => {
			if (word === "&") {
				return "&";
			}
			return word.split("-").map((part, partIndex) => {
				if (!part) {
					return part;
				}
				if (hasLower && /^[A-Z0-9]{2,5}$/.test(part) && /[A-Z]/.test(part)) {
					return part;
				}
				const lower = part.toLowerCase();
				if (index > 0 && partIndex === 0 && MINOR_WORDS.has(lower)) {
					return lower;
				}
				return lower.charAt(0).toUpperCase() + lower.slice(1);
			}).join("-");
		}).join(" ");
	}

	function classifyDistinction(rawToken) {
		const token = cleanText(rawToken);
		if (!token) {
			return null;
		}

		// 1. Finalist (rank 4) — must be checked BEFORE award
		const prefixedFinalist = /^(best(?:\s+[a-z0-9&'-]+){1,4}|(?:outstanding|distinguished)(?:\s+[a-z0-9&'-]+){0,3}\s+paper(?:\s+award)?)\s+(finalist|nominee|runner[- ]up|honorable\s+mention)$/i.exec(token);
		if (prefixedFinalist) {
			const prefix = prefixedFinalist[1].replace(/\b(paper|demo)\s+award$/i, "$1");
			const rawSuffix = prefixedFinalist[2];
			let suffix;
			if (/^runner[- ]up$/i.test(rawSuffix)) {
				suffix = "Runner-Up";
			}
			else if (/^honorable\s+mention$/i.test(rawSuffix)) {
				suffix = "Honorable Mention";
			}
			else {
				suffix = toTitleCase(rawSuffix);
			}
			return { kind: "finalist", label: `${toTitleCase(prefix)} ${suffix}`, rank: 4 };
		}
		if (/^finalist$/i.test(token)) {
			return { kind: "finalist", label: "Finalist", rank: 4 };
		}
		if (/^runner[- ]up$/i.test(token)) {
			return { kind: "finalist", label: "Runner-Up", rank: 4 };
		}
		if (/^honorable\s+mention$/i.test(token)) {
			return { kind: "finalist", label: "Honorable Mention", rank: 4 };
		}

		// 2. Award (rank 5)
		if (/^best(?:\s+[a-z0-9&'-]+){0,3}\s+paper(?:\s+award)?$/i.test(token)) {
			return { kind: "award", label: toTitleCase(token.replace(/\s+award$/i, "")), rank: 5 };
		}
		if (/^best(?:\s+[a-z0-9&'-]+){0,2}\s+demo(?:\s+award)?$/i.test(token)) {
			return { kind: "award", label: toTitleCase(token.replace(/\s+award$/i, "")), rank: 5 };
		}
		if (/^best(?:\s+[a-z0-9&'-]+){1,3}\s+award$/i.test(token)) {
			return { kind: "award", label: toTitleCase(token), rank: 5 };
		}
		if (/^best\s+poster$/i.test(token)) {
			return { kind: "award", label: "Best Poster", rank: 5 };
		}
		if (/^(?:outstanding|distinguished)(?:\s+[a-z0-9&'-]+){0,3}\s+paper(?:\s+award)?$/i.test(token)) {
			return { kind: "award", label: toTitleCase(token.replace(/\s+award$/i, "")), rank: 5 };
		}
		if (/^test\s+of\s+time(?:\s+award)?$/i.test(token)) {
			return { kind: "award", label: "Test of Time", rank: 5 };
		}

		// 3. Oral (rank 3)
		if (/^oral(?:\s+(?:presentation|talk))?$/i.test(token)) {
			return { kind: "oral", label: "Oral", rank: 3 };
		}
		if (/^long\s+oral(?:\s+(?:presentation|talk))?$/i.test(token)) {
			return { kind: "oral", label: "Long Oral", rank: 3 };
		}
		if (/^short\s+oral(?:\s+(?:presentation|talk))?$/i.test(token)) {
			return { kind: "oral", label: "Short Oral", rank: 3 };
		}
		if (/^plenary(?:\s+(?:talk|presentation))?$/i.test(token)) {
			return { kind: "oral", label: "Plenary", rank: 3 };
		}
		if (/^keynote(?:\s+(?:talk|presentation))?$/i.test(token)) {
			return { kind: "oral", label: "Keynote", rank: 3 };
		}
		if (/^invited(?:\s+presentation)?$/i.test(token)) {
			return { kind: "oral", label: "Invited", rank: 3 };
		}
		if (/^invited\s+(?:talk|paper)$/i.test(token)) {
			return { kind: "oral", label: toTitleCase(token), rank: 3 };
		}
		if (/^notable(?:[\s:-]+|\s*\()top[\s-]+5%\)?$/i.test(token)) {
			return { kind: "oral", label: "Notable Top 5%", rank: 3 };
		}
		if (/^top[\s-]+5%$/i.test(token)) {
			return { kind: "oral", label: "Top 5%", rank: 3 };
		}

		// 4. Spotlight (rank 2)
		if (/^spotlight(?:\s+(?:presentation|talk))?$/i.test(token)) {
			return { kind: "spotlight", label: "Spotlight", rank: 2 };
		}
		if (/^highlight(?:\s+(?:presentation|paper))?$/i.test(token)) {
			return { kind: "spotlight", label: "Highlight", rank: 2 };
		}
		if (/^featured(?:\s+(?:presentation|paper))?$/i.test(token)) {
			return { kind: "spotlight", label: "Featured", rank: 2 };
		}
		if (/^notable(?:[\s:-]+|\s*\()top[\s-]+25%\)?$/i.test(token)) {
			return { kind: "spotlight", label: "Notable Top 25%", rank: 2 };
		}
		if (/^notable$/i.test(token)) {
			return { kind: "spotlight", label: "Notable", rank: 2 };
		}

		// 5. Track (rank 0)
		if (/^workshop(?:\s+(?:paper|track))?$/i.test(token)) {
			return { kind: "track", label: "Workshop", rank: 0 };
		}
		if (/^findings$/i.test(token)) {
			return { kind: "track", label: "Findings", rank: 0 };
		}
		if (/^system(?:s)?\s+demo(?:nstration)?$/i.test(token)) {
			return { kind: "track", label: "System Demo", rank: 0 };
		}
		if (/^demo(?:nstration|\s+(?:paper|track))?$/i.test(token)) {
			return { kind: "track", label: "Demo", rank: 0 };
		}
		if (/^datasets?\s+(?:&|and)\s+benchmarks?(?:\s+track)?$/i.test(token)) {
			return { kind: "track", label: "Datasets & Benchmarks", rank: 0 };
		}
		if (/^position$/i.test(token)) {
			return { kind: "track", label: "Position", rank: 0 };
		}
		if (/^position\s+paper$/i.test(token)) {
			return { kind: "track", label: "Position Paper", rank: 0 };
		}
		if (/^short$/i.test(token)) {
			return { kind: "track", label: "Short", rank: 0 };
		}
		if (/^short\s+paper$/i.test(token)) {
			return { kind: "track", label: "Short Paper", rank: 0 };
		}
		if (/^poster(?:\s+presentation)?$/i.test(token)) {
			return { kind: "track", label: "Poster", rank: 0 };
		}
		if (/^tutorial$/i.test(token)) {
			return { kind: "track", label: "Tutorial", rank: 0 };
		}
		if (/^doctoral\s+consortium$/i.test(token)) {
			return { kind: "track", label: "Doctoral Consortium", rank: 0 };
		}
		if (/^journal\s+track$/i.test(token)) {
			return { kind: "track", label: "Journal Track", rank: 0 };
		}

		// 6. Custom (rank 1)
		return { kind: "custom", label: token, rank: 1 };
	}

	function splitTagTokens(raw) {
		const text = cleanText(raw);
		if (!text) {
			return [];
		}
		return text.split(/[,;]+/).map(cleanText).filter(Boolean);
	}

	function mergeDistinctions(items) {
		const byKey = new Map();
		const ordered = [];
		for (const item of items) {
			if (!item) {
				continue;
			}
			const key = item.label.toLowerCase();
			const existing = byKey.get(key);
			if (!existing) {
				const entry = { item, index: ordered.length };
				byKey.set(key, entry);
				ordered.push(entry);
			}
			else if (item.rank > existing.item.rank) {
				existing.item = item;
			}
		}
		ordered.sort((a, b) => (b.item.rank - a.item.rank) || (a.index - b.index));
		return ordered.map((entry) => entry.item);
	}

	function normalizeVenueTags(raw) {
		const classified = splitTagTokens(raw).map(classifyDistinction).filter(Boolean);
		return mergeDistinctions(classified).map((d) => d.label).join(", ");
	}

	function extractInlineVenue(rawVenue) {
		let venue = cleanText(rawVenue);
		const inlineDistinctions = [];
		if (!venue) {
			return { venue: "", distinctions: inlineDistinctions };
		}

		let changed = true;
		while (changed && venue) {
			changed = false;

			const whole = classifyDistinction(venue);
			if (whole && whole.kind !== "custom") {
				break;
			}

			// a) Trailing parenthesized group: e.g., "NeurIPS 2025 (Oral, Best Paper Finalist)"
			const parenMatch = TRAILING_PAREN_RE.exec(venue);
			if (parenMatch) {
				const left = cleanText(parenMatch[1]);
				const tokens = splitTagTokens(parenMatch[2]);
				if (left && tokens.length > 0) {
					const classified = tokens.map(classifyDistinction).filter(Boolean);
					const looksLikeDistinction = classified.some(
						(d) => d.kind !== "custom" || PAREN_DISTINCTION_HINT_RE.test(d.label)
					);
					if (looksLikeDistinction) {
						venue = left;
						inlineDistinctions.unshift(...classified);
						changed = true;
						continue;
					}
				}
			}

			// b) Delimited suffix (" · ", " | ", " — ", " - ", ": ") scanned right-to-left
			const delimiters = [];
			INLINE_DELIMITER_RE.lastIndex = 0;
			let delimMatch;
			while ((delimMatch = INLINE_DELIMITER_RE.exec(venue)) !== null) {
				delimiters.push({ index: delimMatch.index, length: delimMatch[0].length });
			}
			for (let i = delimiters.length - 1; i >= 0; i--) {
				const { index, length } = delimiters[i];
				const left = cleanText(venue.slice(0, index));
				const right = cleanText(venue.slice(index + length));
				if (!left || !right) {
					continue;
				}
				const tokens = splitTagTokens(right);
				const classified = tokens.map(classifyDistinction).filter(Boolean);
				if (classified.length > 0 && classified.every((d) => d.kind !== "custom")) {
					venue = left;
					inlineDistinctions.unshift(...classified);
					changed = true;
					break;
				}
			}
			if (changed) {
				continue;
			}

			// c) Trailing bare keyword phrases (longest match first, right-to-left)
			for (const regex of TRAILING_PHRASE_REGEXES) {
				const match = regex.exec(venue);
				if (!match) {
					continue;
				}
				const left = cleanText(match[1].replace(/[\s,;]+$/, ""));
				if (!left) {
					continue;
				}
				const classified = classifyDistinction(match[2]);
				if (classified && classified.kind !== "custom") {
					venue = left;
					inlineDistinctions.unshift(classified);
					changed = true;
					break;
				}
			}
		}

		return { venue, distinctions: inlineDistinctions };
	}

	function baseVenueKey(raw) {
		return String(raw ?? "")
			.trim()
			.replace(/(?:\s+(?:19|20)\d{2}|\s*'\d{2})$/, "")
			.replace(/\s+/g, " ")
			.toUpperCase();
	}

	function resolveToneForVenue(cleanVenue) {
		const key = baseVenueKey(cleanVenue);
		if (!key) {
			return "muted";
		}
		const exact = VENUE_TONES.get(key);
		if (exact) {
			return exact;
		}
		// Match leading token like "NeurIPS Workshop", "NeurIPS '25 Workshop", or "ICRA-W"
		const head = key.split(/[\s/'-]+/)[0];
		const leading = VENUE_TONES.get(head);
		if (leading) {
			return leading;
		}
		let hash = 0;
		for (let i = 0; i < key.length; i++) {
			hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
		}
		return FALLBACK_TONES[Math.abs(hash) % FALLBACK_TONES.length];
	}

	function resolveTone(raw) {
		const extracted = extractInlineVenue(raw);
		return resolveToneForVenue(extracted.venue);
	}

	function parseVenue(rawVenue, rawTags = "") {
		const extracted = extractInlineVenue(rawVenue);
		const tagDistinctions = splitTagTokens(rawTags).map(classifyDistinction).filter(Boolean);
		const distinctions = mergeDistinctions([...extracted.distinctions, ...tagDistinctions]);
		const venue = extracted.venue;
		const tone = venue ? resolveToneForVenue(venue) : "muted";
		const topKind = distinctions.length ? distinctions[0].kind : null;

		let tooltip = "";
		if (venue && distinctions.length) {
			tooltip = `${venue} — ${distinctions.map((d) => d.label).join(", ")}`;
		}
		else if (venue) {
			tooltip = venue;
		}
		else if (distinctions.length) {
			tooltip = distinctions.map((d) => d.label).join(", ");
		}

		return { venue, tone, distinctions, topKind, tooltip };
	}

	function encodeVenueData(rawVenue, rawTags = "") {
		const parsed = parseVenue(rawVenue, rawTags);
		if (!parsed.venue && !parsed.distinctions.length) {
			return "";
		}
		if (!parsed.distinctions.length) {
			return parsed.venue;
		}
		const tagList = parsed.distinctions.map((d) => d.label).join(", ");
		if (!parsed.venue) {
			return `· ${tagList}`;
		}
		return `${parsed.venue} · ${tagList}`;
	}

	function decodeVenueData(data) {
		const text = cleanText(data);
		if (!text) {
			return parseVenue("", "");
		}
		if (text.startsWith("· ")) {
			return parseVenue("", text.slice(2));
		}
		const sepIndex = text.indexOf(" · ");
		if (sepIndex !== -1) {
			return parseVenue(text.slice(0, sepIndex), text.slice(sepIndex + 3));
		}
		return parseVenue(text, "");
	}

	return {
		resolveTone,
		classifyDistinction,
		normalizeVenueTags,
		parseVenue,
		encodeVenueData,
		decodeVenueData,
	};
})();

if (typeof module !== "undefined" && module.exports) {
	module.exports = ExtraMetaVenues;
}

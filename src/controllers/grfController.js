// src/controllers/grfController.js
import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import { openArchive } from "../utils/grfArchive.js";
import logger from "../utils/logger.js";

const NUL = Buffer.from([0]);

class Grf {
	constructor(filePath) {
		this.fileName = path.basename(filePath);
		this.filePath = filePath;
		this.grf = null;
		this.loaded = false;
	}

	async load() {
		if (!fs.existsSync(this.filePath)) {
			logger.error(`GRF file not found: ${this.filePath}`);
			return;
		}

		try {
			// Shared with the startup validator, which reads the same archives while this runs.
			this.grf = await openArchive(this.filePath);
			this.loaded = true;
		} catch (error) {
			logger.error("Error loading GRF file:", error);
		}
	}

	/** Let go of the archive. The descriptors are released by closeArchives() at shutdown. */
	close() {
		this.grf = null;
		this.loaded = false;
	}

	async getFile(filename) {
		if (!this.loaded || !this.grf) {
			logger.error("GRF not loaded or not initialized");
			return null;
		}
		try {
			const { data, error } = await this.grf.getFile(filename);
			if (error) {
				return null;
			}
			return Buffer.from(data);
		} catch (error) {
			logger.error(`Error extracting file: ${error}`);
			return null;
		}
	}

	listFiles() {
		if (!this.loaded || !this.grf) {
			logger.error("GRF not loaded or not initialized");
			return [];
		}

		return Array.from(this.grf.files.keys());
	}

	/**
	 * Every entry, name and metadata, in table order. The metadata carries `rawNameBytes`, the name as
	 * the archive stores it -- which is how the client spells it in a URL.
	 *
	 * @returns {Iterable<[string, object]>}
	 */
	entries() {
		if (!this.loaded || !this.grf) return [];
		return this.grf.files;
	}

	/**
	 * Every name in the archive as roBrowser keeps them for search (GameFile.js, `table.data`): the raw
	 * name bytes, one character per byte, each followed by a NUL, in table order.
	 *
	 * Built from the bytes on disk rather than by re-encoding the decoded names, so a search sees exactly
	 * what the client would, whatever encoding the loader detected.
	 */
	nameTable() {
		if (!this.loaded || !this.grf) return "";

		const parts = [];
		for (const [name, entry] of this.grf.files) {
			parts.push(entry.rawNameBytes || iconv.encode(name, "cp949"), NUL);
		}
		return Buffer.concat(parts).toString("latin1");
	}
}

export default Grf;

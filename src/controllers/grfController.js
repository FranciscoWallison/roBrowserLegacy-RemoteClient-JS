const { GrfNode } = require("@chicowall/grf-loader");
const fs = require("fs");

class Grf {
	constructor(filePath) {
		this.filePath = filePath;
		this.grf = null;
		this.loaded = false;
	}

	async load() {
		if (!fs.existsSync(this.filePath)) {
			console.error(`GRF file not found: ${this.filePath}`);
			return;
		}

		try {
			const fd = fs.openSync(this.filePath, "r");
			this.grf = new GrfNode(fd);
			await this.grf.load();
			this.loaded = true;
		} catch (error) {
			console.error("Error loading GRF file:", error);
		}
	}

	async getFile(filename) {
		if (!this.loaded || !this.grf) {
			console.error("GRF not loaded or not initialized");
			return null;
		}
		try {
			const { data, error } = await this.grf.getFile(filename);
			if (error) {
				console.error(`Error getting file from GRF: ${error}`);
				return null;
			}
			return Buffer.from(data);
		} catch (error) {
			console.error(`Error extracting file: ${error}`);
			return null;
		}
	}

	listFiles() {
		if (!this.loaded || !this.grf) {
			console.error("GRF not loaded or not initialized");
			return [];
		}

		return Array.from(this.grf.files.keys());
	}
}

module.exports = Grf;

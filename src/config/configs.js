import path from 'node:path';

/** The project folder: the base for DATA.INI, the local asset folders and relative paths in .env. */
const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

const CLIENT_RESPATH = "resources/";
const CLIENT_DATAINI = "DATA.INI";

/** An optional folder from the environment, absolute or relative to the project; null when unset. */
function optionalDir(value) {
	return value ? path.resolve(PROJECT_ROOT, value) : null;
}

export default {
	PROJECT_ROOT,
	DEBUG: process.env.NODE_ENV !== 'production',
	CLIENT_RESPATH,
	CLIENT_DATAINI,
	DATA_INI_PATH: path.join(PROJECT_ROOT, CLIENT_RESPATH, CLIENT_DATAINI),

	// Write every file read from a GRF into the project's data/ folder. Off unless asked for: the
	// copies are read before DATA_OVERRIDE_PATH, so they hide the translated files it provides, and
	// any anonymous request triggers a write to disk.
	CLIENT_AUTOEXTRACT: process.env.CLIENT_AUTOEXTRACT === 'true',
	CLIENT_ENABLESEARCH: process.env.CLIENT_ENABLESEARCH !== 'false',

	// Loose client folders kept outside the project, served read-only for requests under BGM/,
	// System/ and AI/ -- instead of copying them in or linking them. Folders inside the project with
	// the same name still come first.
	ASSET_DIRS: {
		bgm: optionalDir(process.env.BGM_PATH),
		system: optionalDir(process.env.SYSTEM_PATH),
		ai: optionalDir(process.env.AI_PATH),
	},
};

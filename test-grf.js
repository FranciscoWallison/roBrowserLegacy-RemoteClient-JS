const GrfNode = require("@chicowall/grf-loader").GrfNode;
const { openSync, existsSync } = require("fs");
const path = require("path");

const testGrfLoad = async () => {
	// exemplo de diretorio dado pelo DATA.INI
	const data_ini = "resources/data.grf";
	const filePath = path.resolve(data_ini);

	// Verifica se o arquivo existe no caminho especificado
	if (existsSync(filePath)) {
		try {
			const getClientInfo = async () => {
				const fd = openSync(filePath, "r");

				const grf = new GrfNode(fd);

				// Start parsing the grf.
				await grf.load();
				// exemplo de como pegar os arquivos dentro da grf 'data\\pasta\\pasta\\conteudo'
				const exemplo =
					"data\\texture\\À¯ÀúÀÎÅÍÆäÀÌ½º\\swap_equipment\\btn_change2_over.bmp";

				const { data, error } = await grf.getFile(exemplo);

				if (error) {
					console.error("Erro ao obter o arquivo:", error);
					return;
				}

				return data.toString("utf8");
			};
			getClientInfo().then(console.log).catch(console.error);
		} catch (err) {
			console.error("Erro ao abrir o arquivo:", err);
		}
	} else {
		console.error(
			"Arquivo não encontrado no caminho especificado:",
			filePath
		);
	}
};

testGrfLoad().catch((err) => {
	console.error("Erro no teste:", err);
});

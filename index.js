const ocr = require("./utils/ocr");
const { createPDF } = require("./utils/pdf");
const { translate } = require("./utils/translate");

(async () => {
    try {
        const text = await ocr.image2text("./data/sample.png");
        const viText = await translate(text);
        const pdfFile = createPDF(viText);
    } catch (e) {
        console.log(e);
    }
})();

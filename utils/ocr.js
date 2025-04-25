const tesseract = require("node-tesseract-ocr");

async function image2text(path) {
  return await tesseract.recognize(path, {
    lang: "eng",
    oem: 1,
    psm: 6,
    tessjs_create_pdf: "0",
    tessjs_create_tsv: "0",
    tessjs_create_hocr: "0",
    tessjs_create_box: "0",
    tessjs_create_unlv: "0",
    tessjs_pdf_name: "null",
    tessjs_pdf_title: "null",
  })
}

module.exports = {
  image2text
}
function traceWordXmlEscape(s) {
  return String(s ?? "")
    .replace(
      /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
      "",
    )
    .replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
}
function traceWordDocXml(title, body) {
  const lines = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const para = (line, style) =>
    "<w:p>" +
    (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "") +
    '<w:r><w:t xml:space="preserve">' +
    traceWordXmlEscape(line || " ") +
    "</w:t></w:r></w:p>";
  const isHeading = (l) =>
    /^(?:EXECUTIVE SUMMARY|KEY COMMANDER TAKEAWAYS|DECISIONS \/ SUPPORT REQUIRED|UNIT \/ EVENT INFORMATION|SUSTAINS —|IMPROVES —|UNOBSERVED \/|EVALUATOR.S PROPOSED|FACILITATOR FOLLOW-UP|REVIEW \/ APPROVAL|DETAILED ODR|[1-4]\. )/.test(
      l,
    );
  const styles =
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="20"/></w:rPr><w:pPr><w:spacing w:after="100"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="18344A"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="260" w:after="120"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="244D42"/><w:sz w:val="24"/></w:rPr></w:style></w:styles>';
  const doc =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    para(title, "Title") +
    lines
      .map((l) => para(l, isHeading(l.trim()) ? "Heading2" : null))
      .join("") +
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="1080" w:bottom="1000" w:left="1080"/></w:sectPr></w:body></w:document>';
  return { doc, styles };
}
function traceZipBytes(entries) {
  const enc = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const u16 = (n) => [n & 255, (n >>> 8) & 255],
    u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const now = new Date(),
    dosTime =
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      (now.getSeconds() >> 1),
    dosDate =
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate();
  function crc32(b) {
    let c = 0xffffffff;
    for (const x of b) {
      c ^= x;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  for (const [name, data] of entries) {
    const n = enc.encode(name),
      b = enc.encode(data),
      crc = crc32(b),
      size = b.length;
    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(dosTime),
      ...u16(dosDate),
      ...u32(crc),
      ...u32(size),
      ...u32(size),
      ...u16(n.length),
      ...u16(0),
      ...n,
    ]);
    parts.push(local, b);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...u16(20),
        ...u16(0),
        ...u16(0),
        ...u16(dosTime),
        ...u16(dosDate),
        ...u32(crc),
        ...u32(size),
        ...u32(size),
        ...u16(n.length),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset),
        ...n,
      ]),
    );
    offset += local.length + size;
  }
  const centralSize = central.reduce((n, x) => n + x.length, 0),
    end = new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(entries.length),
      ...u16(entries.length),
      ...u32(centralSize),
      ...u32(offset),
      ...u16(0),
    ]);
  return new Blob([...parts, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
function downloadWord(name, title, body) {
  const word = traceWordDocXml(title, body);
  const files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      "word/_rels/document.xml.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    ],
    ["word/document.xml", word.doc],
    ["word/styles.xml", word.styles],
  ];
  const url = URL.createObjectURL(traceZipBytes(files)),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

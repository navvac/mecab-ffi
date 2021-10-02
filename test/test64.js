process.env.PATH += `;${__dirname}`
const Mecab = require('../lib/index');
const mecab = new Mecab("")
const result = mecab.parseSync("テスト中");
console.log(result);
console.log("end");
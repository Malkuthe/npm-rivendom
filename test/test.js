const rivendom = require("../index.js");
const util = require("util");
const fs = require("fs");
const yaml = require("yaml");

const file = fs.readFileSync("./test/impulse.yml","utf8");
const data = yaml.parse(file);

console.log(util.inspect(rivendom.processCreature(data),{depth:null,compact:false}));
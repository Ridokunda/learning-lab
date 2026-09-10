const fs = require('node:fs');
const path = require('node:path');
const bank = require('./src/questions.cjs');
const topics = Object.keys(bank);
if (topics.length !== 15 || topics.some(t => bank[t].length !== 8)) throw Error('Expected 15 topics with 8 questions each');
const questions = [];
for (let round = 0; round < 8; round++) {
  topics.forEach((topic, t) => {
    const row = bank[topic][round];
    if (row.length !== 6 || row.some(v => typeof v !== 'string' || !v.trim())) throw Error('Invalid question');
    const [prompt, answer, b, c, d, explanation] = row;
    if (new Set([answer,b,c,d]).size !== 4) throw Error('Duplicate options');
    const id = questions.length + 1;
    const offset = (round + t) % 4;
    const options = [answer,b,c,d];
    for (let i=0;i<offset;i++) options.unshift(options.pop());
    questions.push({id,group:Math.floor((id-1)/20),topic,prompt,options,correct:offset,explanation});
  });
}
if (new Set(questions.map(q=>q.prompt)).size !== 120) throw Error('Duplicate prompts');
const template = fs.readFileSync(path.join(__dirname,'src','quiz-template.html'),'utf8');
const html = template.replace('__QUESTION_DATA__',JSON.stringify(questions).replace(/</g,'\\u003c'));
fs.writeFileSync(path.join(__dirname,'index.html'),html);
console.log('Built index.html: 120 questions, 6 groups, 15 topics. No runtime dependencies.');

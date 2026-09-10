// Dependency-free offline checks against the exact script shipped in index.html.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const data=html.match(/<script id="question-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const questions=JSON.parse(data);
assert.equal(questions.length,120);
assert.equal(new Set(questions.map(q=>q.prompt)).size,120);
for(let g=0;g<6;g++)assert.equal(questions.filter(q=>q.group===g).length,20);
for(const topic of new Set(questions.map(q=>q.topic)))assert.equal(questions.filter(q=>q.topic===topic).length,8);
for(const q of questions){assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert.ok(q.correct>=0&&q.correct<4);assert.ok(q.explanation.length>50);}
assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i.test(html));
assert.ok(!script.includes('api.openai.com')); // Provider credentials are handled only by the local server.
new vm.Script(script);
function launch({stored=null,blocked=false,records=null}={}){
  const elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{textContent:id==='question-data'?data:'',innerHTML:'',style:{},focus(){},setAttribute(){},showModal(){},close(){}});return elements.get(id);};
  const listeners={};const savedRecords=records||new Map(stored?[['learning-lab.interview.v1',stored]]:[]);
  const document={getElementById:element,querySelector:()=>({focus(){}}),addEventListener:(event,fn)=>listeners[event]=fn};
  const localStorage={getItem:k=>{if(blocked)throw Error('Storage blocked');return savedRecords.get(k)||null;},setItem:(k,v)=>{if(blocked)throw Error('Storage blocked');savedRecords.set(k,v);}};
  const context=vm.createContext({document,localStorage,window:{scrollTo(){}},console,Blob,URL,setTimeout});
  vm.runInContext(script,context);
  return{run:code=>vm.runInContext(code,context),element,saved:()=>savedRecords.get('learning-lab.interview.v1'),records:savedRecords};
}
let app=launch();
assert.equal(app.run('stats().graded.length'),0);
assert.equal(app.run('stats().percentage'),null);
assert.equal(app.run('submitGroup()'),false);
assert.ok(app.element('validation-message').innerHTML.includes('20 remaining'));
app.run('state.answers[1]=QUESTIONS[0].correct; save()');
assert.equal(app.run('submitGroup()'),false);
app=launch({stored:app.saved()});
assert.equal(app.run('answered(0)'),1);
// Every group has 18 correct and two wrong, so final expected score is 108/120.
for(let g=0;g<6;g++){
  app.run(`goGroup(${g}); groupQuestions(${g}).forEach((q,i)=>state.answers[q.id]=i<18?q.correct:(q.correct+1)%4)`);
  assert.equal(app.run('submitGroup()'),true);
  assert.equal(app.run(`score(${g})`),18);
  assert.equal(app.run('stats().graded.length'),(g+1)*20);
  assert.equal(app.run('stats().total'),(g+1)*18);
  assert.equal(app.run('stats().percentage'),90);
}
assert.equal(app.run('stats().wrong.length'),12);
assert.equal(app.run('stats().topics.reduce((n,t)=>n+t.graded,0)'),120);
assert.equal(app.run('stats().topics.reduce((n,t)=>n+t.correct,0)'),108);
app.run('goReport()');
assert.ok(app.element('main').innerHTML.includes('108'));
assert.ok(app.element('main').innerHTML.includes('Review missed questions'));
assert.ok(app.run('reportText()').includes('Total score: 108/120 graded (90%)'));
assert.ok(app.run('reportText()').includes('Explanation:'));
app=launch({stored:app.saved()});
assert.equal(app.run('stats().total'),108);
assert.equal(app.run('state.view'),'report');
app.run('goGroup(0)');
assert.equal((app.element('main').innerHTML.match(/disabled/g)||[]).length,80);
app.run('state=fresh();save();render()');
assert.equal(app.run('stats().graded.length'),0);
assert.equal(app.run('answered(0)'),0);
for(const wantCorrect of [true,false]){
  app=launch();
  app.run(`for(let g=0;g<6;g++){state.group=g;groupQuestions(g).forEach(q=>state.answers[q.id]=${wantCorrect?'q.correct':'(q.correct+1)%4'});submitGroup();}`);
  assert.equal(app.run('stats().total'),wantCorrect?120:0);
  assert.equal(app.run('stats().percentage'),wantCorrect?100:0);
}
app=launch({blocked:true});app.run('state.answers[1]=0;save()');
assert.equal(app.run('answered(0)'),1);
assert.ok(app.element('save-status').textContent.includes('unavailable'));
app=launch({stored:'{broken json'});assert.equal(app.run('answered(0)'),0);
app=launch({stored:JSON.stringify({version:1,answers:{1:99},submitted:[true],group:50})});
assert.equal(app.run('answered(0)'),0);assert.equal(app.run('state.group'),0);assert.equal(app.run('state.submitted[0]'),false);
console.log('PASS: 120 unique questions, 6×20 grouping, 15×8 topic balance, standalone assets and syntax.');
console.log('PASS: incomplete submission, persisted answers, 108/120 mixed score, 0% and 100%, topic totals, answer locking, report, reset, corrupt and blocked storage.');
app=launch();
app.run("state.answers[1]=0;save();library.quizzes.push({id:'quiz-test',title:'Astronomy',questions:DEFAULT_QUESTIONS.slice(0,20)});persistLibrary();switchQuiz('quiz-test')");
assert.equal(app.run('QUESTIONS.length'),20);assert.equal(app.run('GROUP_COUNT'),1);
assert.equal(app.run('answered(0)'),0);
app.run('groupQuestions(0).forEach(q=>state.answers[q.id]=q.correct);submitGroup();goReport()');
assert.equal(app.run('stats().total'),20);assert.equal(app.run('stats().percentage'),100);
assert.ok(app.element('main').innerHTML.includes('All groups are complete'));
app=launch({records:app.records});assert.equal(app.run('quizTitle()'),'Astronomy');assert.equal(app.run('stats().total'),20);
app.run("switchQuiz('interview')");assert.equal(app.run('QUESTIONS.length'),120);assert.equal(app.run('answered(0)'),1);
app.run("switchQuiz('quiz-test')");assert.equal(app.run('stats().total'),20);
assert.ok(!JSON.stringify([...app.records]).includes('apiKey'));
console.log('PASS: generated 20-question quizzes, separate progress, library restoration, and original quiz migration.');

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp,generate,validateQuiz,requestPayload}=require('./server.cjs');
const sample=()=>({title:'Astronomy essentials',questions:Array.from({length:20},(_,i)=>({topic:'Stars',prompt:`Which fact describes example ${i+1}?`,options:['A star emits light','It is always a planet','It is made of ice only','It has no mass'],correct:0,explanation:'Stars emit energy produced through processes such as nuclear fusion.'}))});
const envelope=quiz=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(quiz)}]}],usage:{input_tokens:2000,output_tokens:6000}});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const key='sk-test-placeholder-not-a-real-api-key';
test('request uses the cheap model, structured outputs, bounded output, and disabled storage',()=>{
 const p=requestPayload({topic:'Astronomy',difficulty:'beginner',focus:'Stars'});
 assert.equal(p.model,'gpt-5-nano');assert.equal(p.store,false);assert.equal(p.max_output_tokens,12000);assert.equal(p.text.format.strict,true);assert.equal(p.text.format.schema.properties.questions.minItems,20);
});
test('generation parses API output, preserves answer correctness after shuffling, and computes cost',async()=>{
 let calls=0;
 const q=await generate({topic:'Astronomy',difficulty:'beginner',focus:''},key,async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(options.headers.Authorization,'Bearer '+key);return response(envelope(sample()));});
 assert.equal(calls,1);assert.equal(q.questions.length,20);assert.equal(q.usage.estimatedCost,0.0025);
 for(const row of q.questions)assert.equal(row.options[row.correct],'A star emits light');
 assert.ok(!JSON.stringify(q).includes(key));
});
test('invalid, incomplete, duplicate, and refused output never becomes a saved quiz',async()=>{
 const bad=sample();bad.questions[1].prompt=bad.questions[0].prompt;assert.throws(()=>validateQuiz(bad),/invalid or duplicate/);
 const short=sample();short.questions.pop();assert.throws(()=>validateQuiz(short),/complete 20-question/);
 await assert.rejects(()=>generate({},key,async()=>response({status:'incomplete'})),/stopped before/);
 await assert.rejects(()=>generate({},key,async()=>response({status:'completed',output:[{content:[{type:'refusal'}]}]})),/declined/);
 await assert.rejects(()=>generate({},key,async()=>response(envelope({}))),/complete 20-question/);
});
test('API failures are sanitized with no retries or key disclosure',async()=>{
 let calls=0;
 await assert.rejects(()=>generate({},key,async()=>{calls++;return response({error:{message:key}},401);}),/not accepted/);assert.equal(calls,1);
 await assert.rejects(()=>generate({},key,async()=>response({},429)),/rate limit or insufficient/);
 await assert.rejects(()=>generate({},key,async()=>{throw new DOMException('timeout','TimeoutError');}),/timed out/);
});
test('local HTTP boundary protects generation and never serves secrets or source',async()=>{
 let calls=0;
 const app=createApp({apiKey:key,cooldownMs:0,fetchImpl:async()=>{calls++;return response(envelope(sample()));}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.address().port;
 try{
  const page=await fetch(origin);const html=await page.text();const token=html.match(/name="learning-lab-token" content="([^"]+)"/)[1];
  assert.ok(!html.includes(key));assert.equal(page.headers.get('cache-control'),'no-store');
  const config=await (await fetch(origin+'/api/config')).json();assert.equal(config.keyConfigured,true);assert.ok(!JSON.stringify(config).includes(key));
  for(const p of ['/.env','/server.cjs','/.git/config'])assert.equal((await fetch(origin+p)).status,404);
  const body=JSON.stringify({topic:'Astronomy',difficulty:'beginner',focus:''});
  const headers={'Content-Type':'application/json','Origin':origin,'X-Learning-Token':token};
  assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers:{...headers,Origin:'https://example.com'},body})).status,403);
  assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers:{...headers,'X-Learning-Token':'wrong'},body})).status,403);
  assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers,body:JSON.stringify({topic:'',difficulty:'beginner'})})).status,400);
  assert.equal((await fetch(origin+'/api/generate',{method:'POST',headers,body:JSON.stringify({topic:'Astronomy',difficulty:'beginner',focus:'x'.repeat(6001)})})).status,400);
  assert.equal(calls,0);
  const generated=await fetch(origin+'/api/generate',{method:'POST',headers,body});assert.equal(generated.status,200);assert.equal((await generated.json()).questions.length,20);assert.equal(calls,1);
 }finally{await new Promise(resolve=>app.close(resolve));}
});
test('concurrent requests are blocked while a generation is in flight',async()=>{
 let release;
 const app=createApp({apiKey:key,cooldownMs:0,fetchImpl:()=>new Promise(resolve=>{release=()=>resolve(response(envelope(sample())));})});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+app.address().port;
 try{
  const html=await (await fetch(origin)).text();const token=html.match(/name="learning-lab-token" content="([^"]+)"/)[1];
  const options={method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Learning-Token':token},body:JSON.stringify({topic:'Astronomy',difficulty:'beginner'})};
  const first=fetch(origin+'/api/generate',options);
  while(!release)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await fetch(origin+'/api/generate',options)).status,429);release();assert.equal((await first).status,200);
 }finally{await new Promise(resolve=>app.close(resolve));}
});

#!/usr/bin/env node
/** Compare two generated scorecards: observable outcomes only, never claims superiority from output count. */
import fs from 'node:fs';import path from 'node:path';
const args=process.argv.slice(2);if(args.length!==2){console.error('Usage: node s16b61fix1-compare.mjs path/to/scorecard1.json path/to/scorecard2.json');process.exit(2)}
try {
 const [a,b]=args.map(f=>JSON.parse(fs.readFileSync(path.resolve(f),'utf8')));
 if(a.schema!=='myway_s61fix1_six_capability_scorecard_v1'||b.schema!==a.schema)throw Error('Invalid scorecard schema');
 const rows=[['completion_fraction','Completion'],['invalid_evidence_checks','Rejected invalid references'],['maximum_request_bytes','Largest request bytes'],['total_calls','Model calls'],['estimated_cost_usd','Estimated cost USD']].map(([key,label])=>({metric:label,run_a:a.metrics[key],run_b:b.metrics[key]}));
 console.log(JSON.stringify({schema:'myway_s61fix1_observable_comparison_v1',rows,
  assessment:'These are observed technical metrics; difference in hypothesis count or synthetic learner wording does not establish educational improvement.',
  qualitative_comparison:'Requires matched replay, independent review, and comparable novel assessment outcomes.'},null,2));
}catch(e){console.error('S61-FIX1 comparison failed: '+String(e.message));process.exitCode=1;}

/** S62B authored research openings: NOT evidence of real learner behaviour or model quality. */
export const TOPICS={
 T01:'Graphs: slope and accumulated quantity',T02:'Lake reservoirs: inflow, outflow, storage',T03:'Inflation rates and price levels',T04:'Photosynthesis: energy transformation',T05:'Conditional probability and base rates',
 T06:'Paint mixing and proportions',T07:'Battery energy and power output',T08:'Wildfire spread and burned area',T09:'Population growth and population size',T10:'Cooling rates and temperature',T11:'Sediment transport and river currents',T12:'Music tempo and elapsed beats',T13:'Network queues: arrival and service rates'};
export const STARTING_TOPICS=Object.entries(TOPICS).slice(0,5).map(([id,title])=>({id,title,status:'existing'}));
export const HISTORY=[
 {id:'E-001',topic_id:'T01',text:'Earlier question: The line is still going up but less steep; maybe the amount is going down?',kind:'learner_question_unscored'},
 {id:'E-002',topic_id:'T02',text:'Earlier question: If the pipe slows down the tank starts losing water, right?',kind:'learner_question_unscored'},
 {id:'E-003',topic_id:'T03',text:'Earlier question: Inflation went from 6% to 2%, so prices fell?',kind:'learner_question_unscored'},
 {id:'E-004',topic_id:'T04',text:'Earlier question: Is sunlight kept inside the leaf like a battery holding light?',kind:'learner_question_unscored'},
 {id:'E-005',topic_id:'T05',text:'Earlier question: If 80% of positive tests were real, does that mean 80% of people have it?',kind:'learner_question_unscored'}
];
const base=(id,type,claim,topics,ids,instances=[])=>({id,type,claim,topics,possible_instances:instances,status:'provisional',uncertainty:'high',evidence:{supports_current:ids,challenges_current:[],historical_context:[],context:[]},revisions:[{version:0,source_id:ids[0],action:'historical_curator_seed',reason:'Unscored question only; a hypothesis, NOT a proven learner mechanism'}],not_ground_truth:true});
export const INITIAL_RECORDS=[
 base('NORA-R-001','root','Questioned whether less-steep positive slope implies decreasing total',['T01'],['E-001']),
 base('NORA-R-002','root','Questioned whether slower inflow necessarily implies decreasing reservoir level',['T02'],['E-002']),
 base('NORA-R-003','root','Questioned whether lower positive inflation means a decrease in prices',['T03'],['E-003']),
 base('NORA-R-004','root','Questioned whether plants store sunlight unchanged rather than transform energy',['T04'],['E-004']),
 base('NORA-R-005','root','Questioned whether conditional probabilities imply a population base rate',['T05'],['E-005']),
 base('NORA-S-001','shared_root','Possible recurrent confusion interpreting slower positive rates as a falling accumulated quantity; untested mechanism',['T01','T02'],['E-001','E-002'],['NORA-R-001','NORA-R-002'])
];
export const LEARNER_PRIVATE={identity:'NORA fictional learner',preferences:['story problems about towns and systems','visual examples sometimes interesting'],tendencies:['may initially equate slower with decreasing total in verbal problems','can calculate simple explicit rates','sometimes declines repetitive quizzes'],uncertain:['independent transfer','auditory perception','3D spatial understanding'],source:'fictional persona for simulation only; not supplied to A/B'};
// Intent routing for authored pilot is pinned so we can test components independently;
// a separate real-world topic-intent classifier is NOT validated by this fixture.
export const EPISODES=[
 ['T01','I still feel that if a graph rises more slowly, the total must have started falling.'],
 ['T02','Can a reservoir start losing water if inflow slows down even with the outlet unchanged?'],
 ['T06','I want to make purple paint; if I use half as much blue, what happens to the ratio?'],
 ['T05','If 80 percent of positive tests are real, does that tell me how many people have the condition?'],
 ['T07','If a battery is delivering power more slowly, does that mean the stored energy went up?'],
 ['T03','Inflation falls from six percent to two percent. Can I still say prices are going up?'],
 ['T08','A wildfire spreads more slowly. Is the amount of land burned starting to shrink?'],
 ['T04','Is a plant actually storing sunlight or turning it into a different form of energy?'],
 ['T09','When population growth slows, can the population still be larger next year?'],
 ['T01','Give me a new graph example that I have not seen before.'],
 ['T10','If something cools by three degrees per minute, what does a negative rate mean?'],
 ['T02','I could calculate a tank with 6 in and 2 out, but the words slowing down still confuse me.'],
 ['T11','Does a slower river necessarily carry less sediment overall?'],
 ['T06','I think the ratio of two paint colors can remain constant when the batch gets bigger.'],
 ['T12','If a drummer slows the tempo, have fewer beats happened overall?'],
 ['T03','Could I try an unfamiliar inflation example without hints?'],
 ['T13','Messages arrive more slowly at a server. Will the queue automatically shrink?'],
 ['T05','Let me explain the denominator choice in a completely new base-rate problem.'],
 ['T09','Can I compare population growth rates and total population without a reminder?'],
 ['T07','Now give me a harder battery example where power and energy move in opposite directions.']
].map(([topic_id,opening],i)=>({step:i+1,topic_id,opening,topic_title:TOPICS[topic_id]}));
export function initialState(){return {learner:'NORA',topics:structuredClone(STARTING_TOPICS),observations:structuredClone(HISTORY).map(x=>({...x,conditions:{origin:'historical_curator_question',graded:false}})),records:structuredClone(INITIAL_RECORDS),version:0,dialogue:[],events:[]};}
export function routeAuthoredEpisode(state,e){const found=state.topics.find(t=>t.id===e.topic_id);if(found)return {action:'reuse',id:found.id,title:found.title};const title=TOPICS[e.topic_id];if(!title)throw Error('Scenario unknown topic');state.topics.push({id:e.topic_id,title,status:'new_from_authored_opening'});return {action:'new',id:e.topic_id,title,note:'PILOT ONLY: known authored intent; arbitrary user topic routing not validated'};}

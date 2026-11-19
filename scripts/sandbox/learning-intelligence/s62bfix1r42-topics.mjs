/** Domain-diverse topic opportunities, NOT assessment tasks, causal labels or root keys. */
export const TOPIC_BANK=Object.freeze([
 ['T01','Fractions and equivalent quantities','Mathematics'],
 ['T02','Graph slopes and change','Mathematics'],
 ['T03','Conditional probability','Mathematics'],
 ['T04','Exponential growth','Mathematics'],
 ['T05','Area, volume and scale','Mathematics'],
 ['T06','Photosynthesis','Natural science'],
 ['T07','Electrical circuits','Natural science'],
 ['T08','Forces and motion','Natural science'],
 ['T09','Heat transfer','Natural science'],
 ['T10','Ecosystem interactions','Natural science'],
 ['T11','Neural communication','Biology'],
 ['T12','Breathing and gas exchange','Biology'],
 ['T13','Blood circulation','Biology'],
 ['T14','Inheritance and genetics','Biology'],
 ['T15','Homeostasis','Biology'],
 ['T16','Inflation and prices','Economics and society'],
 ['T17','Supply and demand','Economics and society'],
 ['T18','Interest and saving','Economics and society'],
 ['T19','Population change','Economics and society'],
 ['T20','Evaluating risk','Economics and society'],
 ['T21','Algorithms','Computing'],
 ['T22','Recursion','Computing'],
 ['T23','Computer networks','Computing'],
 ['T24','Encryption and privacy','Computing'],
 ['T25','Machine-learning predictions','Computing'],
 ['T26','Cooking ratios','Everyday reasoning'],
 ['T27','Directions and navigation','Everyday reasoning'],
 ['T28','Water reservoirs','Everyday reasoning'],
 ['T29','Scheduling and time constraints','Everyday reasoning'],
 ['T30','Interpreting evidence','Everyday reasoning']
].map(([id,title,domain])=>Object.freeze({id,title,domain})));
export const TOPIC_IDS=new Set(TOPIC_BANK.map(t=>t.id));
export const LEARNERS=Object.freeze({
 ATLAS:{identity:'ATLAS',profile:'A curious, reflective fictional learner; enjoys quantitative puzzles and occasionally follows an idea across contexts. Their actual skills and misconceptions are unspecified and may change.',interests:['patterns','real-world examples'],preferences:['explanations that link to concrete situations']},
 JUNO:{identity:'JUNO',profile:'A fictional learner who often reasons aloud, may prefer discussions or examples over formal tests, and can change interests between visits. Do not preassign correct answers or specific misconceptions.',interests:['stories','living things','technology'],preferences:['conversation with meaningful choices']},
 MICA:{identity:'MICA',profile:'A fictional learner comfortable trying activities and asking exploratory questions, sometimes wanting independence. Do not force success, failure, transfer or a root cause.',interests:['visual ideas','everyday puzzles'],preferences:['trying ideas and reflecting afterward']}
});
export function emptyState(learner){if(!LEARNERS[learner])throw Error('Unknown learner');return {learner,topics:TOPIC_BANK.map(t=>({id:t.id,title:t.title,status:'available'})),observations:[],records:[],version:0,dialogue:[],events:[],learner_visible_history:[],visit_count:0};}
export function topicById(id){return TOPIC_BANK.find(t=>t.id===id)||null;}

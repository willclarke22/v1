import {screen,identity} from '../r62b3/render-review.mjs';
const reviewed=Object.freeze([{session:'real01',artifact:'t0001-bx',identity:'682912a8512cf5df9929cbdffcfae74af2e5e2257a1853abecd2fcd868623374',code_sha256:'508e0f064d12ed13a31d1002774c15b4e7fc433020baac379ac27788a882c9cc'}]);
export function isReviewed(session,a){if(!a)return false;const s=screen(a);return s.screen_pass&&reviewed.some(r=>r.session===session&&r.artifact===a.id&&r.identity===identity(a)&&r.code_sha256===s.code_sha256);}
export function playbackAllowed(session,a,report){return isReviewed(session,a)&&(!report||report.passed===true||report.retryable===true);}

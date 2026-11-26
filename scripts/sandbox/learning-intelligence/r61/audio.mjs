import {fixtureNarration} from './fixture.mjs';
// Provider boundary: audio is available only when the exact cue text matches the recorded fixture.
// No TTS provider is called by R6.1; R6.2 may supply measured, cached audio per exact cue.
export function audioForArtifact(artifact,timing){return Object.fromEntries(artifact.narration.flatMap(n=>{const expected=fixtureNarration.find(f=>f.id===n.id&&f.text===n.text);return expected&&timing[n.id]&&Number.isFinite(timing[n.id].duration)&&timing[n.id].duration>0?[[n.id,{...timing[n.id],source:'local_fixture_audio'}]]:[];}));}

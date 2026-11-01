/** One-to-one cleanup, not a model rewrite: never invents subject terms. */
const acronyms = new Set(["SLP","HIV","DNA","RNA","MRI","ECG","TEP","ATP","ADHD","ASD","COPD","ENT","COVID","ICU","CT"]);
const connectors = new Set(["and","of","in","with","for","to","on","the","a","an","vs"]);
export function normalizeTopicLabel(input: string): string {
  const cleaned = input.normalize("NFKC").replace(/[\p{C}]/gu," ").replace(/[\s_]+/g," ").replace(/[.!?,;:]+$/g,"").trim();
  if(!cleaned || cleaned.length>110) return "";
  const words = cleaned.split(" ");
  if(words.length>12) return "";
  const output = words.map((word,i)=>{
    const upper=word.toUpperCase();
    if(acronyms.has(upper)) return upper;
    if(/^[A-Z0-9]{2,6}$/.test(word)) return word;
    if(i>0 && connectors.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toLocaleUpperCase("en-US")+word.slice(1);
  }).join(" ");
  return output.length>=3 && output.length<=110 ? output : "";
}

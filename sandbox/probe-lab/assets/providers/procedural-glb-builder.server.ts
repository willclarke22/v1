import type { GlmProceduralAssetPlan, GlmProceduralPart } from "./glm-procedural-schema";

type MeshData = { positions: number[]; normals: number[]; indices: number[] };

function box(): MeshData {
  const p = [
    -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5,
    0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5,
    -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5,
    0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5,
    -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5,
    -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5,
  ];
  const ns = [[0,0,1],[0,0,-1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0]];
  const normals = ns.flatMap((n) => [...n,...n,...n,...n]);
  const indices: number[] = [];
  for (let f=0; f<6; f++) { const o=f*4; indices.push(o,o+1,o+2,o,o+2,o+3); }
  return { positions:p, normals, indices };
}

function sphere(segments=20, rings=12): MeshData {
  const positions:number[]=[]; const normals:number[]=[]; const indices:number[]=[];
  for(let y=0;y<=rings;y++){ const v=y/rings; const phi=v*Math.PI; for(let x=0;x<=segments;x++){ const u=x/segments; const theta=u*Math.PI*2; const nx=Math.sin(phi)*Math.cos(theta); const ny=Math.cos(phi); const nz=Math.sin(phi)*Math.sin(theta); positions.push(nx*0.5,ny*0.5,nz*0.5); normals.push(nx,ny,nz); }}
  for(let y=0;y<rings;y++) for(let x=0;x<segments;x++){ const a=y*(segments+1)+x; const b=a+segments+1; indices.push(a,b,a+1,b,b+1,a+1); }
  return {positions,normals,indices};
}

function cylinder(segments=24): MeshData {
  const positions:number[]=[]; const normals:number[]=[]; const indices:number[]=[];
  for(let i=0;i<=segments;i++){ const a=i/segments*Math.PI*2; const x=Math.cos(a)*0.5,z=Math.sin(a)*0.5; positions.push(x,-0.5,z,x,0.5,z); normals.push(Math.cos(a),0,Math.sin(a),Math.cos(a),0,Math.sin(a)); }
  for(let i=0;i<segments;i++){ const o=i*2; indices.push(o,o+1,o+2,o+1,o+3,o+2); }
  const bottomCenter=positions.length/3; positions.push(0,-0.5,0); normals.push(0,-1,0);
  const topCenter=positions.length/3; positions.push(0,0.5,0); normals.push(0,1,0);
  for(let i=0;i<segments;i++){ const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2; const bi=positions.length/3; positions.push(Math.cos(a)*0.5,-0.5,Math.sin(a)*0.5,Math.cos(b)*0.5,-0.5,Math.sin(b)*0.5); normals.push(0,-1,0,0,-1,0); indices.push(bottomCenter,bi+1,bi); const ti=positions.length/3; positions.push(Math.cos(a)*0.5,0.5,Math.sin(a)*0.5,Math.cos(b)*0.5,0.5,Math.sin(b)*0.5); normals.push(0,1,0,0,1,0); indices.push(topCenter,ti,ti+1); }
  return {positions,normals,indices};
}

function quaternionFromEulerDegrees([x,y,z]:[number,number,number]) {
  const rx=x*Math.PI/360, ry=y*Math.PI/360, rz=z*Math.PI/360;
  const sx=Math.sin(rx),cx=Math.cos(rx),sy=Math.sin(ry),cy=Math.cos(ry),sz=Math.sin(rz),cz=Math.cos(rz);
  return [sx*cy*cz-cx*sy*sz, cx*sy*cz+sx*cy*sz, cx*cy*sz-sx*sy*cz, cx*cy*cz+sx*sy*sz];
}

function pad4(buffer: Buffer, byte=0) { const padding=(4-buffer.length%4)%4; return padding ? Buffer.concat([buffer,Buffer.alloc(padding,byte)]) : buffer; }

export function buildProceduralGlb(plan: GlmProceduralAssetPlan) {
  const chunks:Buffer[]=[]; const bufferViews:any[]=[]; const accessors:any[]=[]; const meshes:any[]=[]; const nodes:any[]=[]; const materials:any[]=[];
  let byteOffset=0;
  function addBuffer(data:Buffer,target:number){ const padded=pad4(data); const index=bufferViews.length; bufferViews.push({buffer:0,byteOffset,byteLength:data.length,target}); chunks.push(padded); byteOffset+=padded.length; return index; }
  function addAccessor(view:number,componentType:number,count:number,type:string,min?:number[],max?:number[]){ const accessor:any={bufferView:view,componentType,count,type}; if(min) accessor.min=min;if(max) accessor.max=max; accessors.push(accessor); return accessors.length-1; }
  for(const part of plan.parts){
    const geometry = part.primitive === "box" ? box() : part.primitive === "sphere" ? sphere() : cylinder(part.radial_segments ?? 24);
    const positions=new Float32Array(geometry.positions); const normals=new Float32Array(geometry.normals); const indices=new Uint32Array(geometry.indices);
    const pView=addBuffer(Buffer.from(positions.buffer),34962); const nView=addBuffer(Buffer.from(normals.buffer),34962); const iView=addBuffer(Buffer.from(indices.buffer),34963);
    const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity]; for(let i=0;i<geometry.positions.length;i+=3) for(let a=0;a<3;a++){ mins[a]=Math.min(mins[a],geometry.positions[i+a]);maxs[a]=Math.max(maxs[a],geometry.positions[i+a]); }
    const pAcc=addAccessor(pView,5126,positions.length/3,"VEC3",mins,maxs); const nAcc=addAccessor(nView,5126,normals.length/3,"VEC3"); const iAcc=addAccessor(iView,5125,indices.length,"SCALAR");
    const mat=materials.push({name:`${part.name}_material`,pbrMetallicRoughness:{baseColorFactor:part.color,metallicFactor:part.metallic,roughnessFactor:part.roughness}})-1;
    const mesh=meshes.push({name:part.name,primitives:[{attributes:{POSITION:pAcc,NORMAL:nAcc},indices:iAcc,material:mat,mode:4}]})-1;
    nodes.push({name:part.name,mesh,translation:part.position,rotation:quaternionFromEulerDegrees(part.rotation_deg),scale:part.scale});
  }
  const binary=Buffer.concat(chunks);
  const gltf:any={asset:{version:"2.0",generator:"MyWay GLM 5.2 Procedural Builder"},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,materials,buffers:[{byteLength:binary.length}],bufferViews,accessors,extras:{myway_glm_plan:plan}};
  const json=pad4(Buffer.from(JSON.stringify(gltf)),0x20); const bin=pad4(binary);
  const total=12+8+json.length+8+bin.length; const header=Buffer.alloc(12); header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(total,8);
  const jh=Buffer.alloc(8); jh.writeUInt32LE(json.length,0); jh.writeUInt32LE(0x4e4f534a,4); const bh=Buffer.alloc(8); bh.writeUInt32LE(bin.length,0); bh.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,jh,json,bh,bin]);
}

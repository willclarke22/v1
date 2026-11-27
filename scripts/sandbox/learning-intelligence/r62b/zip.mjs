import zlib from 'node:zlib';
const bad=(msg)=>Error(msg);
const ZIP_CRC_TABLE=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(buf){let c=0xFFFFFFFF;for(const b of buf)c=ZIP_CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function makeZip(files){
 const local=[],central=[];let offset=0;
 for(const [name,data] of files){
  if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.includes('..')||name.startsWith('/'))throw bad('Invalid export entry name',500);
  const fn=Buffer.from(name,'utf8'),input=Buffer.isBuffer(data)?data:Buffer.from(data),packed=zlib.deflateRawSync(input,{level:6}),checksum=crc32(input);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(8,8);l.writeUInt32LE(checksum,14);l.writeUInt32LE(packed.length,18);l.writeUInt32LE(input.length,22);l.writeUInt16LE(fn.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(checksum,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(input.length,24);c.writeUInt16LE(fn.length,28);c.writeUInt32LE(offset,42);
  local.push(l,fn,packed);central.push(c,fn);offset+=l.length+fn.length+packed.length;
 }
 if(files.length>65535)throw bad('Too many files in export',413);
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,cd,end]);
}

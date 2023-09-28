const { Resolver } = require('node:dns').promises;
const resolver = new Resolver();

async function GetSPFromPID(pid) {
  try {
    let spl = await fetch('https://heyfil.prod.cid.contact/sp?peerid=' + pid);
    let sps = await spl.json().catch(e=>{
      console.log('failed to get size of ' + pid);
      return {}
    });
    if (sps.length == 0) {
      return {}
    }

    // now get the miner info
    let spi = await fetch('https://heyfil.prod.cid.contact/sp/' + sps[0])
    return await spi.json().catch(e=>{
      console.log('failed to get info for ' + pid);
      return {}
    });
  } catch(e) {
    console.log('failed to get size of ' + pid + ': ' + e);
    return {};
  }
}

async function GetSubnetSizes() {
  console.log("getting providers...");
  let x = await fetch('https://cid.contact/providers')
  let y = await x.json()
  let addrs = y.map(z => z.Publisher.Addrs)

  console.log("resolving provider market endpoints...")
  let subnets = await Promise.all(addrs.map(async function(p) {
    return await Promise.all(p.map(async function(a) {
      let host = a.split("/")[2];
      return await resolver.resolve4(host).catch(e=>{return [host]});
    }))
  }))

  console.log("learning provider sizes....")
  let minerids = [];
  let sizes = await Promise.all(y.map(async function(p, idx) {
    let pid = p.Publisher.ID;
    let fullSP = await GetSPFromPID(pid);
    if (fullSP.state_miner_power != undefined) {
//      console.log("have a real size for " + pid + ": " + JSON.stringify(fullSP.state_miner_power));
      minerids[idx] = fullSP.id;
      return fullSP.state_miner_power.MinerPower.RawBytePower;
    }
    return "0";
  }))

  let buckets= {};
  subnets.forEach((m,i)=>{m.flat().forEach(a=>{let b = a.split(".").slice(0,-1).join("."); let c = buckets[b]; if (!c) {c=[];} c.push(i); buckets[b]=c; })})

 let subNetSizes = {};
  Object.keys(buckets).forEach(subnet => {
    let idxs = buckets[subnet];
    let size = BigInt(0);
    let sps = [];
    idxs.forEach(idx => {
      if (sizes[idx] != undefined) {
        size += BigInt(sizes[idx]);
      }
      if (minerids[idx] != undefined) {
        sps.push(minerids[idx]);
      }
    })
    if (size != 0) {
      subNetSizes[subnet] = [humanFileSize(size), sps];
    }
  })

  return subNetSizes;
}

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte']
const BYTES_PER_KB = 1000

function humanFileSize(sizeBytes) {
  let size = Math.abs(Number(sizeBytes))

  let u = 0
  while(size >= BYTES_PER_KB && u < UNITS.length-1) {
      size /= BYTES_PER_KB
      ++u
  }

  return new Intl.NumberFormat([], {
      style: 'unit',
      unit: UNITS[u],
      unitDisplay: 'short',
      maximumFractionDigits: 1,
  }).format(size)
}

GetSubnetSizes().then(buckets=>{
  console.log(buckets)
});
